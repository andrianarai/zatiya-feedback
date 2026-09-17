const SHEET_NAME = "Responses";
const HEADERS = [
  "Timestamp",
  "Meeting",
  "Rating",
  "NewIdeas",
  "Takeaway",
  "Improvement",
];

function doGet() {
  return HtmlService.createHtmlOutput(
    "<h2>ЗАТІЯ</h2><p>Сервіс приймання відгуків працює.</p>",
  );
}

function doPost(event) {
  let requestToken = "";
  const lock = LockService.getScriptLock();

  try {
    const data = event && event.parameter ? event.parameter : {};
    const meeting = Number(data.Meeting);
    const rating = Number(data.Rating);
    const newIdeas = cleanText_(data.NewIdeas, 30);
    const takeaway = safeCellText_(data.Takeaway, 500);
    const improvement = safeCellText_(data.Improvement, 500);
    requestToken = cleanText_(data.RequestToken, 100);

    if (![1, 2, 3, 4].includes(meeting)) {
      throw new Error("Некоректний номер зустрічі.");
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new Error("Оцінка має бути від 1 до 5.");
    }

    if (!["Так", "Частково", "Ні"].includes(newIdeas)) {
      throw new Error("Некоректна відповідь на запитання про нові ідеї.");
    }

    if (!/^[a-zA-Z0-9-]{8,100}$/.test(requestToken)) {
      throw new Error("Некоректний ідентифікатор відправлення.");
    }

    lock.waitLock(10000);

    const cache = CacheService.getScriptCache();
    const cacheKey = `zatiya-${requestToken}`;

    if (cache.get(cacheKey) === "saved") {
      return response_(true, "Відгук уже збережено.", requestToken);
    }

    const sheet = getResponseSheet_();
    sheet.appendRow([
      new Date(),
      meeting,
      rating,
      newIdeas,
      takeaway,
      improvement,
    ]);
    SpreadsheetApp.flush();

    // Prevents a retry with the same request token from creating a duplicate row.
    // The token itself is not written to the spreadsheet.
    cache.put(cacheKey, "saved", 21600);

    return response_(true, "Відгук збережено.", requestToken);
  } catch (error) {
    console.error(error);
    return response_(
      false,
      "Не вдалося зберегти відгук. Спробуй ще раз.",
      requestToken,
    );
  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}

function getResponseSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error("Apps Script не підключений до Google Таблиці.");
  }

  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
  } else {
    const currentHeaders = sheet
      .getRange(1, 1, 1, HEADERS.length)
      .getDisplayValues()[0];

    if (currentHeaders.join("|") !== HEADERS.join("|")) {
      throw new Error("Заголовки таблиці не відповідають очікуваним.");
    }
  }

  return sheet;
}

function cleanText_(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function safeCellText_(value, maxLength) {
  const text = cleanText_(value, maxLength);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function response_(ok, message, requestToken) {
  const payload = JSON.stringify({
    type: "zatiya-feedback-response",
    ok: ok,
    message: message,
    requestToken: requestToken,
  })
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

  const html = `<!doctype html>
    <html lang="uk">
      <head><meta charset="UTF-8"></head>
      <body>
        <script>window.parent.postMessage(${payload}, "*");<\/script>
      </body>
    </html>`;

  return HtmlService.createHtmlOutput(html)
    .setTitle("ЗАТІЯ — відповідь")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

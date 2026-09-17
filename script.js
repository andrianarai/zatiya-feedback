// Paste the Google Apps Script Web App URL between the quotes.
// It must end with /exec, not /dev.
const APPS_SCRIPT_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";

const SUBMISSION_TIMEOUT_MS = 20000;

const feedbackForm = document.querySelector("#feedbackForm");
const formPanel = document.querySelector("#formPanel");
const successPanel = document.querySelector("#successPanel");
const meetingErrorPanel = document.querySelector("#meetingErrorPanel");
const meetingLabel = document.querySelector("#meetingLabel");
const submitButton = document.querySelector("#submitButton");
const submitStatus = document.querySelector("#submitStatus");
const ratingFieldset = document.querySelector("#ratingFieldset");
const ideasFieldset = document.querySelector("#ideasFieldset");
const ratingError = document.querySelector("#ratingError");
const ideasError = document.querySelector("#ideasError");
const starRating = document.querySelector("#starRating");
const stars = [...document.querySelectorAll(".star")];
const ideasGroup = document.querySelector("#newIdeasChoices");
const ideaButtons = [...document.querySelectorAll(".choice-button")];
const submissionForm = document.querySelector("#submissionForm");

const meeting = new URLSearchParams(window.location.search).get("meeting");
const isValidMeeting = /^[1-4]$/.test(meeting || "");

let selectedRating = 0;
let selectedNewIdeas = "";
let isSubmitting = false;
let requestToken = "";
let responseTimer = null;

if (!isValidMeeting) {
  formPanel.hidden = true;
  meetingErrorPanel.hidden = false;
} else {
  meetingLabel.textContent = `Зустріч ${meeting}`;
}

function renderStars(value) {
  stars.forEach((star) => {
    const starValue = Number(star.dataset.value);
    const isFilled = starValue <= value;
    const isChosen = starValue === selectedRating;

    star.textContent = isFilled ? "★" : "☆";
    star.classList.toggle("is-selected", isFilled);
    star.setAttribute("aria-checked", String(isChosen));
    star.tabIndex = isChosen || (selectedRating === 0 && starValue === 1) ? 0 : -1;
  });
}

function chooseRating(value, moveFocus = false) {
  selectedRating = value;
  renderStars(value);
  ratingError.textContent = "";
  ratingFieldset.classList.remove("has-error");

  if (moveFocus) {
    stars[value - 1].focus();
  }
}

stars.forEach((star) => {
  star.addEventListener("click", () => chooseRating(Number(star.dataset.value)));
  star.addEventListener("pointerenter", () => renderStars(Number(star.dataset.value)));
});

starRating.addEventListener("pointerleave", () => renderStars(selectedRating));

starRating.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    return;
  }

  event.preventDefault();
  const current = selectedRating || 1;
  const direction = event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : -1;
  chooseRating(Math.min(5, Math.max(1, current + direction)), true);
});

function chooseNewIdeas(value, moveFocus = false) {
  selectedNewIdeas = value;

  ideaButtons.forEach((button, index) => {
    const isChosen = button.dataset.value === value;
    button.classList.toggle("is-selected", isChosen);
    button.setAttribute("aria-checked", String(isChosen));
    button.tabIndex = isChosen || (!value && index === 0) ? 0 : -1;
  });

  ideasError.textContent = "";
  ideasFieldset.classList.remove("has-error");

  if (moveFocus) {
    ideaButtons.find((button) => button.dataset.value === value)?.focus();
  }
}

ideaButtons.forEach((button) => {
  button.addEventListener("click", () => chooseNewIdeas(button.dataset.value));
});

ideasGroup.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    return;
  }

  event.preventDefault();
  const currentIndex = Math.max(
    0,
    ideaButtons.findIndex((button) => button.dataset.value === selectedNewIdeas),
  );
  const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
  const nextIndex = (currentIndex + direction + ideaButtons.length) % ideaButtons.length;
  chooseNewIdeas(ideaButtons[nextIndex].dataset.value, true);
});

function validateForm() {
  let firstInvalidControl = null;

  if (selectedRating < 1 || selectedRating > 5) {
    ratingError.textContent = "Обери оцінку від однієї до п’яти зірок.";
    ratingFieldset.classList.add("has-error");
    firstInvalidControl = stars[0];
  }

  if (!["Так", "Частково", "Ні"].includes(selectedNewIdeas)) {
    ideasError.textContent = "Обери один варіант.";
    ideasFieldset.classList.add("has-error");
    firstInvalidControl ||= ideaButtons[0];
  }

  if (firstInvalidControl) {
    firstInvalidControl.focus();
    firstInvalidControl.scrollIntoView({ behavior: "smooth", block: "center" });
    return false;
  }

  return true;
}

function createRequestToken() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function setSubmitting(submitting) {
  isSubmitting = submitting;
  submitButton.disabled = submitting;
  submitButton.classList.toggle("is-loading", submitting);
  submitButton.querySelector(".button-label").textContent = submitting
    ? "Надсилаємо..."
    : "Надіслати відгук";
}

function showSuccess() {
  clearTimeout(responseTimer);
  requestToken = "";
  setSubmitting(false);
  formPanel.hidden = true;
  successPanel.hidden = false;
  successPanel.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showSubmissionError(message) {
  clearTimeout(responseTimer);
  setSubmitting(false);
  submitStatus.textContent = message;
}

window.addEventListener("message", (event) => {
  const payload = event.data;

  if (
    !payload ||
    payload.type !== "zatiya-feedback-response" ||
    payload.requestToken !== requestToken
  ) {
    return;
  }

  if (payload.ok) {
    showSuccess();
  } else {
    showSubmissionError(payload.message || "Не вдалося надіслати відгук. Спробуй ще раз.");
  }
});

feedbackForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (isSubmitting || !isValidMeeting || !validateForm()) {
    return;
  }

  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(APPS_SCRIPT_URL)) {
    showSubmissionError("Форму ще не підключено. Повідом організатора ЗАТІЇ.");
    return;
  }

  setSubmitting(true);
  submitStatus.textContent = "";
  requestToken ||= createRequestToken();

  document.querySelector("#submissionMeeting").value = meeting;
  document.querySelector("#submissionRating").value = String(selectedRating);
  document.querySelector("#submissionNewIdeas").value = selectedNewIdeas;
  document.querySelector("#submissionTakeaway").value = document.querySelector("#takeaway").value.trim();
  document.querySelector("#submissionImprovement").value = document.querySelector("#improvement").value.trim();
  document.querySelector("#submissionToken").value = requestToken;
  submissionForm.action = APPS_SCRIPT_URL;
  submissionForm.submit();

  responseTimer = window.setTimeout(() => {
    showSubmissionError("Відповідь сервера затримується. Перевір інтернет і спробуй ще раз.");
  }, SUBMISSION_TIMEOUT_MS);
});

renderStars(0);
chooseNewIdeas("");

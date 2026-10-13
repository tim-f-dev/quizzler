const submitButton = document.getElementById("submit-answer");
const resultDisplay = document.getElementById("submission-result");

submitButton.addEventListener("click", async () => {
  submitButton.disabled = true;
  resultDisplay.textContent = "Submitting...";

  try {
    const response = await fetch("/api/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: "player123",
        question_id: 1,
        answer: {
          selected_index: 2,
        },
      }),
    });

    const result = await response.json();
    console.log(result);
    resultDisplay.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    console.error("Submission failed:", error);
    resultDisplay.textContent = "Could not submit the answer. Please try again.";
  } finally {
    submitButton.disabled = false;
  }
});

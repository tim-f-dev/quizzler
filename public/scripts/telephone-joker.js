// Edit weights and wording here. Weights are relative and need not add up to 1.
window.TelephoneJoker = {
  responses: [
    {
      weight: 0.5,
      answerType: "correct",
      templates: { en: "I think it's {answer}", de: "Ich glaube, es ist {answer}" },
    },
    {
      weight: 0.5,
      answerType: "wrong",
      templates: { en: "I don't think it's {answer}", de: "Ich glaube nicht, dass es {answer} ist" },
    },
  ],
  choose(question, random = Math.random) {
    const total = this.responses.reduce((sum, response) => sum + response.weight, 0);
    let draw = random() * total;
    const response = this.responses.find(item => (draw -= item.weight) < 0)
      || this.responses[this.responses.length - 1];
    const correct = question.answer.correct_index;
    const candidates = question.data.options_en.map((_, index) => index)
      .filter(index => response.answerType === "correct" ? index === correct : index !== correct);
    return { response, answerIndex: candidates[Math.floor(random() * candidates.length)] };
  },
  format(hint, question, language) {
    const options = question.data["options_" + language] || question.data.options_en;
    return (hint.response.templates[language] || hint.response.templates.en)
      .replace("{answer}", options[hint.answerIndex]);
  },
};

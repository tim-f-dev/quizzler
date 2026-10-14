window.ChatJoker = {
  rules: [
    { through: 5, correctMin: 50, correctMax: 100, wrongMax: 100 },
    { through: 9, correctMin: 30, correctMax: 100, wrongMax: 40 },
    { through: 13, correctMin: 30, correctMax: 60, wrongMax: 50 },
  ],
  percentages(questionNumber, correctIndex, random = Math.random) {
    const rule = this.rules.find(rule => questionNumber <= rule.through);
    if (!rule || questionNumber < 1 || !Number.isInteger(correctIndex) ||
        correctIndex < 0 || correctIndex > 3) throw new Error("Invalid chat question");
    const integer = (min, max) => min + Math.floor(random() * (max - min + 1));
    const result = [0, 0, 0, 0];
    result[correctIndex] = integer(rule.correctMin, rule.correctMax);
    let remaining = 100 - result[correctIndex];
    const wrong = [0, 1, 2, 3].filter(index => index !== correctIndex);
    for (let index = wrong.length - 1; index > 0; index--) {
      const other = integer(0, index);
      [wrong[index], wrong[other]] = [wrong[other], wrong[index]];
    }
    wrong.forEach((answerIndex, index) => {
      const slotsLeft = wrong.length - index - 1;
      const min = Math.max(0, remaining - slotsLeft * rule.wrongMax);
      const max = Math.min(rule.wrongMax, remaining);
      result[answerIndex] = slotsLeft === 0 ? remaining : integer(min, max);
      remaining -= result[answerIndex];
    });
    return result;
  },
};

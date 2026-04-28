const K = 32;

function expectedScore(ra, rb) {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}

function updateRatings(ratingA, ratingB, scoreA) {
  const ea = expectedScore(ratingA, ratingB);
  const eb = 1 - ea;
  const scoreB = 1 - scoreA;
  const newA = Math.round(ratingA + K * (scoreA - ea));
  const newB = Math.round(ratingB + K * (scoreB - eb));
  return { newA, newB };
}

module.exports = { updateRatings };

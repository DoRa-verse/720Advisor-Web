const strategies = [
  {
    id: "hot",
    label: "빈출 추세형",
    badge: "HOT",
    text: "조와 각 자리에서 자주 나온 숫자에 가중치를 둡니다.",
    pick: ({ stats }) => weightedTicket(stats, "hot")
  },
  {
    id: "cold",
    label: "장기 미출현형",
    badge: "COLD",
    text: "최근 덜 나온 조와 자리 숫자를 우선합니다.",
    pick: ({ stats }) => weightedTicket(stats, "cold")
  },
  {
    id: "balance",
    label: "균형 혼합형",
    badge: "MIX",
    text: "빈출, 미출현, 홀짝, 합계 균형을 함께 봅니다.",
    pick: ({ stats }) => balancedTicket(stats)
  },
  {
    id: "tail",
    label: "끝자리 방어형",
    badge: "TAIL",
    text: "6등과 7등에 직접 연결되는 끝 두 자리에 가중치를 둡니다.",
    pick: ({ stats }) => tailTicket(stats)
  },
  {
    id: "contra",
    label: "비인기 패턴형",
    badge: "ODD",
    text: "사람이 자주 고르는 생일식, 반복식 패턴을 피합니다.",
    pick: ({ stats }) => contrarianTicket(stats)
  }
];

let state = {
  data: { updatedAt: null, rounds: [] },
  stats: emptyStats(),
  recommendations: {},
  chasing: {}
};

const cards = document.querySelector("#cards");
const roundCount = document.querySelector("#roundCount");
const latestRound = document.querySelector("#latestRound");
const updatedAt = document.querySelector("#updatedAt");
const drawTitle = document.querySelector("#drawTitle");
const drawDate = document.querySelector("#drawDate");
const firstPrize = document.querySelector("#firstPrize");
const bonusPrize = document.querySelector("#bonusPrize");
const dataStatus = document.querySelector("#dataStatus");
const mixPlan = document.querySelector("#mixPlan");
const updateData = document.querySelector("#updateData");
const refreshAll = document.querySelector("#refreshAll");
const mixAdvice = document.querySelector("#mixAdvice");
const analysisInputs = Array.from(document.querySelectorAll("#analysisInputs input"));
const analyzeNumber = document.querySelector("#analyzeNumber");
const clearAnalysis = document.querySelector("#clearAnalysis");
const analysisResult = document.querySelector("#analysisResult");

function emptyStats() {
  return {
    groups: Array.from({ length: 5 }, () => 0),
    positions: Array.from({ length: 6 }, () => Array.from({ length: 10 }, () => 0)),
    bonusPositions: Array.from({ length: 6 }, () => Array.from({ length: 10 }, () => 0)),
    lastSeenGroup: Array.from({ length: 5 }, () => Infinity),
    lastSeenPosition: Array.from({ length: 6 }, () => Array.from({ length: 10 }, () => Infinity)),
    latest: null,
    count: 0
  };
}

function buildStats(rounds) {
  const stats = emptyStats();
  const ordered = [...rounds].sort((a, b) => a.round - b.round);
  stats.count = ordered.length;
  stats.latest = ordered.at(-1) || null;

  ordered.forEach((draw, index) => {
    stats.groups[draw.group - 1] += 1;
    draw.digits.forEach((digit, position) => {
      stats.positions[position][digit] += 1;
      stats.lastSeenPosition[position][digit] = ordered.length - index - 1;
    });
    draw.bonus?.forEach((digit, position) => {
      stats.bonusPositions[position][digit] += 1;
    });
    stats.lastSeenGroup[draw.group - 1] = ordered.length - index - 1;
  });

  return stats;
}

function weightedIndex(weights) {
  const safeWeights = weights.map((value) => Math.max(0.01, value));
  const total = safeWeights.reduce((sum, value) => sum + value, 0);
  let cursor = Math.random() * total;
  for (let index = 0; index < safeWeights.length; index += 1) {
    cursor -= safeWeights[index];
    if (cursor <= 0) return index;
  }
  return safeWeights.length - 1;
}

function groupWeights(stats, mode) {
  if (!stats.count) return [1, 1, 1, 1, 1];
  if (mode === "cold") return stats.groups.map((count, index) => 1 + stats.count / (1 + count) + Math.min(18, stats.lastSeenGroup[index]));
  if (mode === "contra") return stats.groups.map((count) => 1 + stats.count / (1 + count));
  return stats.groups.map((count) => 1 + count);
}

function digitWeights(stats, position, mode) {
  if (!stats.count) return Array.from({ length: 10 }, () => 1);
  if (mode === "cold") {
    return stats.positions[position].map((count, digit) => 1 + stats.count / (1 + count) + Math.min(24, stats.lastSeenPosition[position][digit]));
  }
  if (mode === "contra") {
    return stats.positions[position].map((count, digit) => {
      const birthdayPenalty = position < 2 && digit <= 3 ? 0.65 : 1;
      return (1 + stats.count / (1 + count)) * birthdayPenalty;
    });
  }
  return stats.positions[position].map((count) => 1 + count);
}

function scoreTicket(ticket, stats) {
  if (!stats.count) return "랜덤 균형 추천";
  const oddCount = ticket.digits.filter((digit) => digit % 2).length;
  const total = ticket.digits.reduce((sum, digit) => sum + digit, 0);
  const unique = new Set(ticket.digits).size;
  const low = ticket.digits.filter((digit) => digit <= 4).length;
  const repeats = 6 - unique;
  const spread = Math.max(...ticket.digits) - Math.min(...ticket.digits);
  const sumBand = total < 20 ? "저합" : total > 34 ? "고합" : "중간합";
  const repeatLabel = repeats === 0 ? "반복 없음" : repeats <= 2 ? "반복 적정" : "반복 많음";
  const spreadLabel = spread >= 7 ? "분산 넓음" : spread >= 5 ? "분산 보통" : "분산 좁음";
  return `홀짝 ${oddCount}:${6 - oddCount}, 저고 ${low}:${6 - low}, ${sumBand} ${total}, ${spreadLabel}, ${repeatLabel}`;
}

function funChance(ticket, stats, mode) {
  if (!stats.count) {
    return Math.floor(35 + Math.random() * 55);
  }

  const groupRank = rankValue(stats.groups, ticket.group - 1, mode === "cold" || mode === "contra");
  const digitRanks = ticket.digits.map((digit, position) => rankValue(stats.positions[position], digit, mode === "cold" || mode === "contra"));
  const rankAverage = (groupRank + digitRanks.reduce((sum, value) => sum + value, 0)) / 7;
  const shapeBonus = new Set(ticket.digits).size >= 4 ? 7 : 0;
  const tailBonus = mode === "tail" ? 8 : 0;
  const balanceBonus = mode === "balance" ? 6 : 0;
  const contraBonus = mode === "contra" ? 9 : 0;
  const sparkle = Math.floor(Math.random() * 17) - 4;
  return Math.max(3, Math.min(100, Math.round(rankAverage * 86 + shapeBonus + tailBonus + balanceBonus + contraBonus + sparkle)));
}

function rankValue(values, selectedIndex, reverse = false) {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => reverse ? a.value - b.value : b.value - a.value);
  const rank = sorted.findIndex((item) => item.index === selectedIndex);
  if (rank < 0) return 0.5;
  return 1 - rank / Math.max(1, sorted.length - 1);
}

function frequencyShare(values, selectedIndex) {
  const total = values.reduce((sum, value) => sum + value, 0);
  return total ? values[selectedIndex] / total : 0;
}

function isTooPlain(digits) {
  const text = digits.join("");
  const unique = new Set(digits).size;
  const ascending = "0123456789".includes(text);
  const descending = "9876543210".includes(text);
  const allLowBirthday = Number(text.slice(0, 2)) <= 31 && Number(text.slice(2, 4)) <= 12;
  return unique <= 2 || ascending || descending || allLowBirthday;
}

function weightedTicket(stats, mode) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ticket = {
      group: weightedIndex(groupWeights(stats, mode)) + 1,
      digits: Array.from({ length: 6 }, (_, position) => weightedIndex(digitWeights(stats, position, mode)))
    };
    if (!isTooPlain(ticket.digits)) {
      return { ...ticket, mode, score: scoreTicket(ticket, stats), funChance: funChance(ticket, stats, mode) };
    }
  }
  return {
    group: Math.floor(Math.random() * 5) + 1,
    digits: Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)),
    mode,
    funChance: Math.floor(20 + Math.random() * 70),
    score: "랜덤 균형 추천"
  };
}

function balancedTicket(stats) {
  let best = null;
  for (let attempt = 0; attempt < 220; attempt += 1) {
    const mode = Math.random() > 0.45 ? "hot" : "cold";
    const ticket = weightedTicket(stats, mode);
    const sum = ticket.digits.reduce((acc, digit) => acc + digit, 0);
    const odd = ticket.digits.filter((digit) => digit % 2).length;
    const unique = new Set(ticket.digits).size;
    const quality = 60 - Math.abs(sum - 27) * 1.6 - Math.abs(odd - 3) * 6 + unique * 2;
    if (!best || quality > best.quality) best = { ...ticket, quality };
  }
  return { ...best, mode: "balance", funChance: funChance(best, stats, "balance"), score: `${scoreTicket(best, stats)}, 균형형` };
}

function tailTicket(stats) {
  const ticket = weightedTicket(stats, "hot");
  ticket.digits[4] = weightedIndex(digitWeights(stats, 4, "hot").map((value, digit) => value + stats.bonusPositions[4][digit] * 0.5));
  ticket.digits[5] = weightedIndex(digitWeights(stats, 5, "hot").map((value, digit) => value + stats.bonusPositions[5][digit] * 0.5));
  ticket.score = `${scoreTicket(ticket, stats)}, 끝자리 집중`;
  ticket.mode = "tail";
  ticket.funChance = funChance(ticket, stats, "tail");
  return ticket;
}

function contrarianTicket(stats) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const ticket = weightedTicket(stats, "contra");
    const sum = ticket.digits.reduce((acc, digit) => acc + digit, 0);
    if (!isTooPlain(ticket.digits) && sum >= 18 && sum <= 39 && new Set(ticket.digits).size >= 4) {
      return { ...ticket, mode: "contra", funChance: funChance(ticket, stats, "contra"), score: `${scoreTicket(ticket, stats)}, 패턴 회피` };
    }
  }
  return weightedTicket(stats, "contra");
}

function renderTicket(ticket) {
  let attemptText = "";
  if (ticket.chaseFound) {
    attemptText = `<p class="score">${ticket.attempts}번 만에 90% 이상 후보를 찾았습니다.</p>`;
  } else if (ticket.chaseLimitReached) {
    attemptText = `<p class="score">${ticket.attempts}번까지 확인한 최고 후보입니다.</p>`;
  } else if (ticket.attempts) {
    attemptText = `<p class="score">${ticket.attempts}번 돌려서 찾은 후보입니다.</p>`;
  }
  return `
    <div class="ticket">
      <div class="group">${ticket.group}조</div>
      <div class="digits">${ticket.digits.map((digit) => `<span class="digit">${digit}</span>`).join("")}</div>
    </div>
    <div class="fun-odds">
      <div class="fun-odds-head">
        <span>당첨 기대감</span>
        <strong>${ticket.funChance ?? 50}%</strong>
      </div>
      <div class="meter"><div class="meter-fill" style="width: ${ticket.funChance ?? 50}%"></div></div>
    </div>
    ${attemptText}
    <p class="score">${ticket.score || "재미 추천"}</p>
  `;
}

function refreshStrategy(id) {
  const strategy = strategies.find((item) => item.id === id);
  state.recommendations[id] = strategy.pick(state);
  renderCards();
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function chaseHighChance(id, target = 90, maxAttempts = 3000) {
  if (state.chasing[id]) return;
  state.chasing[id] = true;
  renderCards();

  const strategy = strategies.find((item) => item.id === id);
  let best = null;
  let attempt = 0;

  try {
    while (state.chasing[id]) {
      for (let batch = 0; batch < 80; batch += 1) {
        attempt += 1;
        const ticket = strategy.pick(state);
        if (!best || ticket.funChance > best.funChance) best = { ...ticket, attempts: attempt };
        if (ticket.funChance >= target) {
          state.recommendations[id] = { ...ticket, attempts: attempt, chaseFound: true };
          state.chasing[id] = false;
          renderCards();
          return;
        }
      }

      state.recommendations[id] = best;
      renderCards();
      if (attempt >= maxAttempts) {
        state.recommendations[id] = { ...best, attempts: attempt, chaseLimitReached: true };
        state.chasing[id] = false;
        renderCards();
        return;
      }
      await sleep(0);
    }
  } finally {
    state.chasing[id] = false;
    renderCards();
  }
}

function refreshEveryStrategy() {
  strategies.forEach((strategy) => {
    state.recommendations[strategy.id] = strategy.pick(state);
  });
  renderCards();
  renderAdvice();
}

function renderCards() {
  cards.innerHTML = strategies.map((strategy) => {
    const ticket = state.recommendations[strategy.id];
    return `
      <article class="card">
        <header>
          <div>
            <h2>${strategy.label}</h2>
            <p>${strategy.text}</p>
          </div>
          <span class="badge ${strategy.id}">${strategy.badge}</span>
        </header>
        ${ticket ? renderTicket(ticket) : ""}
        <div class="card-actions">
          <button data-refresh="${strategy.id}">이 방식만 다시 뽑기</button>
          <button class="secondary" data-chase="${strategy.id}" ${state.chasing[strategy.id] ? "disabled" : ""}>${state.chasing[strategy.id] ? "찾는 중" : "90% 이상 찾기"}</button>
        </div>
      </article>
    `;
  }).join("");

  cards.querySelectorAll("[data-refresh]").forEach((button) => {
    button.addEventListener("click", () => refreshStrategy(button.dataset.refresh));
  });
  cards.querySelectorAll("[data-chase]").forEach((button) => {
    button.addEventListener("click", () => chaseHighChance(button.dataset.chase));
  });
}

function topDigitsForPosition(stats, position) {
  return stats.positions[position]
    .map((count, digit) => ({ digit, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((item) => item.digit);
}

function renderAdvice() {
  const stats = state.stats;
  if (!stats.count) {
    mixAdvice.textContent = "통계가 없을 때는 다섯 방식에서 1장씩 뽑는 게 가장 단순합니다.";
    renderMixPlan([
      ["1장", "빈출 추세형", "자주 나온 숫자 흐름 보기"],
      ["1장", "장기 미출현형", "한동안 안 나온 숫자 보정"],
      ["1장", "균형 혼합형", "홀짝과 숫자합 균형"],
      ["1장", "끝자리 방어형", "마지막 두 자리 챙기기"],
      ["1장", "비인기 패턴형", "남들이 고를 법한 패턴 피하기"]
    ]);
    return;
  }

  const hotGroup = stats.groups.indexOf(Math.max(...stats.groups)) + 1;
  const coldGroup = stats.groups.indexOf(Math.min(...stats.groups)) + 1;
  const ending = topDigitsForPosition(stats, 5).join(", ");

  mixAdvice.textContent = `5장을 산다면 한 방식에 몰지 말고 아래처럼 나눠 뽑는 구성이 쉽습니다. 최근 통계상 ${hotGroup}조 흐름과 ${coldGroup}조 보정, 마지막 자리 ${ending} 쪽을 함께 챙깁니다.`;
  renderMixPlan([
    ["2장", "균형 혼합형", "가장 무난한 기본 추천"],
    ["1장", "빈출 추세형", `${hotGroup}조처럼 자주 나온 흐름 반영`],
    ["1장", "장기 미출현형", `${coldGroup}조처럼 덜 나온 흐름 보정`],
    ["1장", "끝자리 방어형", `마지막 자리 ${ending} 흐름 반영`]
  ]);
}

function renderMixPlan(items) {
  mixPlan.innerHTML = `
    ${items.map(([count, title, detail]) => `
      <div class="mix-item">
        <div class="mix-count">${count.replace("장", "")}</div>
        <div>
          <strong>${title}</strong>
          <span>${detail}</span>
        </div>
        <span>${count}</span>
      </div>
    `).join("")}
    <p class="mix-note">카드 위의 “이 방식만 다시 뽑기”를 눌러 마음에 드는 번호가 나올 때 멈추면 됩니다.</p>
  `;
}

function getAnalysisDigits() {
  const values = analysisInputs.map((input) => input.value.trim());
  if (values.some((value) => !/^\d$/.test(value))) return null;
  return values.map(Number);
}

function analyzeDigits(digits) {
  const stats = state.stats;
  const rounds = state.data.rounds || [];
  const oddCount = digits.filter((digit) => digit % 2).length;
  const lowCount = digits.filter((digit) => digit <= 4).length;
  const total = digits.reduce((sum, digit) => sum + digit, 0);
  const unique = new Set(digits).size;
  const repeats = 6 - unique;
  const spread = Math.max(...digits) - Math.min(...digits);
  const digitRanks = digits.map((digit, position) => rankValue(stats.positions[position], digit));
  const rankAverage = digitRanks.reduce((sum, value) => sum + value, 0) / digitRanks.length;
  const frequencyAverage = digits.reduce((sum, digit, position) => sum + frequencyShare(stats.positions[position], digit), 0) / digits.length;
  const balanceBonus = 12 - Math.abs(total - 27) * 0.7 - Math.abs(oddCount - 3) * 3 + Math.min(unique, 5) * 1.5;
  const expectation = Math.max(3, Math.min(99, Math.round(rankAverage * 72 + balanceBonus)));
  const exactFirstHits = rounds.filter((round) => round.digits?.join("") === digits.join(""));
  const exactBonusHits = rounds.filter((round) => round.bonus?.join("") === digits.join(""));
  const tailHits = rounds.filter((round) => round.digits?.slice(4).join("") === digits.slice(4).join(""));
  const sumBand = total < 20 ? "저합" : total > 34 ? "고합" : "중간합";
  const repeatLabel = repeats === 0 ? "반복 없음" : repeats <= 2 ? "반복 적정" : "반복 많음";
  const spreadLabel = spread >= 7 ? "분산 넓음" : spread >= 5 ? "분산 보통" : "분산 좁음";
  const advice =
    expectation >= 75
      ? "통계 흐름과 패턴 균형이 좋은 편입니다. 같은 번호로 계속 구매해도 무난하지만, 실제 확률은 변하지 않습니다."
      : expectation >= 55
        ? "무난한 번호입니다. 계속 가져가도 되고, 가끔 다른 방식 추천과 섞어도 좋습니다."
        : "통계 기준 매력은 약한 편입니다. 계속 고집하기보다는 다른 후보와 섞는 쪽이 더 가볍습니다.";

  return {
    expectation,
    exactFirstHits,
    exactBonusHits,
    tailHits,
    frequencyAverage,
    descriptors: `홀짝 ${oddCount}:${6 - oddCount}, 저고 ${lowCount}:${6 - lowCount}, ${sumBand} ${total}, ${spreadLabel}, ${repeatLabel}`,
    advice
  };
}

function renderAnalysis() {
  const digits = getAnalysisDigits();
  if (!digits) {
    analysisResult.innerHTML = "<p>분석할 숫자 6개를 입력해 주세요.</p>";
    return;
  }

  if (!state.stats.count) {
    analysisResult.innerHTML = "<p>통계 데이터를 불러온 뒤 분석할 수 있습니다.</p>";
    return;
  }

  const result = analyzeDigits(digits);
  analysisResult.innerHTML = `
    <div class="analysis-summary">
      <div>
        <span>당첨 기대감</span>
        <strong>${result.expectation}%</strong>
      </div>
      <div>
        <span>실제 1등 확률</span>
        <strong>1 / 5,000,000</strong>
      </div>
      <div>
        <span>조 제외 6자리</span>
        <strong>약 1 / 1,000,000</strong>
      </div>
    </div>
    <div class="meter analysis-meter"><div class="meter-fill" style="width: ${result.expectation}%"></div></div>
    <p class="analysis-advice">${result.advice}</p>
    <dl class="analysis-details">
      <div><dt>번호 패턴</dt><dd>${result.descriptors}</dd></div>
      <div><dt>역대 동일 6자리</dt><dd>1등 ${result.exactFirstHits.length}회, 보너스 ${result.exactBonusHits.length}회</dd></div>
      <div><dt>끝 두 자리 흐름</dt><dd>${result.tailHits.length}회 출현, 자리별 평균 빈도 ${(result.frequencyAverage * 100).toFixed(1)}%</dd></div>
    </dl>
  `;
}

function renderMeta() {
  const rounds = state.data.rounds || [];
  const latest = rounds.length ? rounds.reduce((best, round) => round.round > best.round ? round : best, rounds[0]) : null;
  const staleInfo = latest ? getStaleInfo(latest) : null;
  roundCount.textContent = rounds.length ? `${rounds.length.toLocaleString("ko-KR")}회차 수집` : "수집 필요";
  latestRound.textContent = latest ? `${latest.round}회` : "-";
  updatedAt.textContent = rounds.length && state.data.updatedAt ? new Date(state.data.updatedAt).toLocaleString("ko-KR") : "업데이트 필요";
  dataStatus.classList.toggle("error", Boolean(state.data.updateError));
  dataStatus.classList.toggle("warning", Boolean(!state.data.updateError && staleInfo?.stale));
  if (state.data.updateError) {
    dataStatus.textContent = `업데이트 실패: ${state.data.updateError}`;
  } else if (state.data.updateSkipped) {
    dataStatus.textContent = `${state.data.updateMessage} 다음 업데이트 권장 시점: ${formatDateTime(state.data.nextUpdateAt)}`;
  } else if (staleInfo?.stale) {
    dataStatus.textContent = `${latest.round}회 추첨일로부터 ${staleInfo.days}일 지났습니다. 자동 업데이트 상태를 확인해 주세요.`;
  } else if (latest) {
    dataStatus.textContent = "연금복권 당첨번호 데이터 기준으로 표시 중입니다.";
  } else {
    dataStatus.textContent = rounds.length ? "수집된 당첨번호 데이터 기준으로 표시 중입니다." : "";
  }
  renderLatestDraw(latest);
}

function parseDrawDate(value) {
  if (!value) return null;
  const korean = value.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  const dotted = value.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  const match = korean || dotted;
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0);
}

function getStaleInfo(latest) {
  const drawDate = parseDrawDate(latest.drawDate);
  if (!drawDate) return null;
  const days = Math.floor((Date.now() - drawDate.getTime()) / (24 * 60 * 60 * 1000));
  return { days, stale: days >= 9 };
}

function formatDateTime(value) {
  if (!value) return "다음 추첨 이후";
  return new Date(value).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function ballClass(index) {
  return ["red", "orange", "yellow", "blue", "purple", "gray"][index] || "gray";
}

function renderNumberBalls(digits) {
  return digits.map((digit, index) => `<span class="draw-ball ${ballClass(index)}">${digit}</span>`).join("");
}

function renderLatestDraw(latest) {
  if (!latest) {
    drawTitle.textContent = "최근 추첨 결과";
    drawDate.textContent = "통계 업데이트 후 표시됩니다.";
    firstPrize.innerHTML = "";
    bonusPrize.innerHTML = "";
    return;
  }

  const scrapedDate = latest.drawDate || latest.scrapedAt || state.data.updatedAt;
  drawTitle.innerHTML = `제 <strong>${latest.round}</strong>회 추첨 결과`;
  drawDate.textContent = latest.drawDate ? `${latest.drawDate} 추첨` : scrapedDate ? `${new Date(scrapedDate).toLocaleDateString("ko-KR")} 기준` : "최신 수집 기준";
  firstPrize.innerHTML = `<span class="draw-ball group">${latest.group}</span><span class="group-text">조</span>${renderNumberBalls(latest.digits)}`;
  bonusPrize.innerHTML = `<span class="draw-spacer"></span><span class="group-text">각조</span>${renderNumberBalls(latest.bonus || [])}`;
}

async function loadStats(forceUpdate = false, options = {}) {
  const { refreshRecommendations = false } = options;
  const cacheBust = forceUpdate ? `?t=${Date.now()}` : "";
  const response = await fetch(`./data/winners.json${cacheBust}`);
  if (!response.ok) {
    throw new Error("통계 데이터를 불러오지 못했습니다.");
  }
  state.data = await response.json();
  state.stats = buildStats(state.data.rounds || []);
  renderMeta();
  renderAdvice();
  renderAnalysis();
  if (refreshRecommendations) refreshEveryStrategy();
}

updateData.addEventListener("click", async () => {
  updateData.disabled = true;
  updateData.textContent = "읽는 중";
  try {
    await loadStats(true);
  } catch (error) {
    state.data = { ...state.data, updateError: error.message };
    renderMeta();
  } finally {
    updateData.disabled = false;
    updateData.textContent = "새로고침 완료";
    window.setTimeout(() => {
      updateData.textContent = "데이터 새로고침";
    }, 2200);
  }
});

refreshAll.addEventListener("click", refreshEveryStrategy);
analyzeNumber.addEventListener("click", renderAnalysis);
clearAnalysis.addEventListener("click", () => {
  analysisInputs.forEach((input) => {
    input.value = "";
  });
  renderAnalysis();
  analysisInputs[0]?.focus();
});
analysisInputs.forEach((input, index) => {
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 1);
    if (input.value && index < analysisInputs.length - 1) {
      analysisInputs[index + 1].focus();
    }
    renderAnalysis();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Backspace" && !input.value && index > 0) {
      analysisInputs[index - 1].focus();
    }
  });
});

renderMeta();
refreshEveryStrategy();

loadStats(false).catch((error) => {
  state.data = { ...state.data, updateError: error.message };
  renderMeta();
});

import { appendFile, readFile, writeFile } from "node:fs/promises";

const DATA_FILE = new URL("../data/winners.json", import.meta.url);
const OFFICIAL_URL = "https://www.dhlottery.co.kr/gameResult.do?method=win720";
const MOBILE_OFFICIAL_URL = "https://m.dhlottery.co.kr/gameResult.do?method=win720";
const PYONY_URL = "https://pyony.com/lotto720/rounds";
const FETCH_TIMEOUT_MS = 8000;
const MAX_FETCH_ATTEMPTS = 3;

function sameRound(a, b) {
  return Boolean(
    a &&
    b &&
    a.round === b.round &&
    a.group === b.group &&
    JSON.stringify(a.digits) === JSON.stringify(b.digits) &&
    JSON.stringify(a.bonus) === JSON.stringify(b.bonus) &&
    (a.drawDate || null) === (b.drawDate || null)
  );
}

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&#40;/g, "(")
    .replace(/&#41;/g, ")")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRound(html, requestedRound) {
  const text = decodeHtml(html);
  if (/서비스\s*(접근|접속).*(차단|불가)|페이지를 찾을 수 없습니다|ERROR\s*404/.test(text)) return null;
  if (/추첨전입니다/.test(text) && !/1등\s+1등\s*번호기준/.test(text) && !/1등\s+월\s*700/.test(text)) return null;

  const roundMatch =
    text.match(/제\s*(\d+)회\s+추첨\s+결과/) ||
    text.match(/연금복권720\+\s*(\d+)회\s+당첨번호/) ||
    text.match(/(\d+)회\s*\((\d{4}년\s*\d{1,2}월\s*\d{1,2}일)\s*추첨\)/) ||
    text.match(/(\d+)회\s+당첨번호/) ||
    text.match(/(\d+)회\s+등위별\s+당첨금\s+및\s+당첨번호/);
  const dateMatch = text.match(/(\d{4}\.\d{2}\.\d{2})\s*추첨/);
  const koreanDateMatch = text.match(/\d+회\s*\((\d{4}년\s*\d{1,2}월\s*\d{1,2}일)\s*추첨\)/);
  const desktopFirstMatch = text.match(/1등\s+1등\s*번호기준\s+([1-5])\s*조\s*([0-9])\s*([0-9])\s*([0-9])\s*([0-9])\s*([0-9])\s*([0-9])/);
  const desktopBonusMatch = text.match(/보너스\s+보너스\s*번호기준\s+([0-9])\s*([0-9])\s*([0-9])\s*([0-9])\s*([0-9])\s*([0-9])/);
  const mobileFirstMatch = text.match(/1등\s+월\s*700\s*만원\s*X?\s*20\s*년\s+([1-5])조\s+([0-9])\s+([0-9])\s+([0-9])\s+([0-9])\s+([0-9])\s+([0-9])/);
  const mobileBonusMatch = text.match(/보너스\s+월\s*100\s*만원\s*X?\s*10\s*년\s+각\s*조\s+([0-9])\s+([0-9])\s+([0-9])\s+([0-9])\s+([0-9])\s+([0-9])/);
  const pyonyFirstMatch = text.match(/1등\s+월\s*700만원x20년\s+([1-5])조\s+([0-9])\s+([0-9])\s+([0-9])\s+([0-9])\s+([0-9])\s+([0-9])\s+[0-9,]+/);
  const pyonyBonusMatch = text.match(/보너스\s+월\s*100만원x10년\s+-\s+([0-9])\s+([0-9])\s+([0-9])\s+([0-9])\s+([0-9])\s+([0-9])\s+[0-9,]+/);

  const firstMatch = desktopFirstMatch || mobileFirstMatch || pyonyFirstMatch;
  const bonusMatch = desktopBonusMatch || mobileBonusMatch || pyonyBonusMatch;
  if (!firstMatch || !bonusMatch) return null;

  return {
    round: roundMatch ? Number(roundMatch[1]) : requestedRound,
    group: Number(firstMatch[1]),
    digits: firstMatch.slice(2, 8).map(Number),
    bonus: bonusMatch.slice(1, 7).map(Number),
    drawDate: dateMatch ? dateMatch[1] : koreanDateMatch ? koreanDateMatch[1].replace(/\s+/g, " ") : null
  };
}

async function fetchRound(round = null) {
  const suffix = round == null ? "" : `&Round=${round}`;
  const urls = [
    `${MOBILE_OFFICIAL_URL}${suffix}`,
    `${OFFICIAL_URL}${suffix}`,
    round == null ? `${PYONY_URL}/latest/` : `${PYONY_URL}/${round}/`
  ];

  let lastError = null;
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "user-agent": "Mozilla/5.0 720Advisor-Web GitHub-Actions/1.0",
          "accept": "text/html,application/xhtml+xml"
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = parseRound(await response.text(), round);
      if (parsed) return parsed;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return null;
}

function isCompleteThrough(rounds, latestRound) {
  if (!latestRound || rounds.length < latestRound) return false;
  const roundSet = new Set(rounds.map((item) => item.round));
  for (let round = 1; round <= latestRound; round += 1) {
    if (!roundSet.has(round)) return false;
  }
  return true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRoundReliable(round = null) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      return await fetchRound(round);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_FETCH_ATTEMPTS) {
        await sleep(1000 * attempt);
      }
    }
  }
  throw lastError;
}

async function writeSummary(message) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${message}\n`, "utf8");
}

async function main() {
  const existing = JSON.parse(await readFile(DATA_FILE, "utf8"));
  const rounds = Array.isArray(existing.rounds) ? existing.rounds : [];
  const byRound = new Map(rounds.map((item) => [item.round, item]));
  const cachedMax = Math.max(0, ...rounds.map((item) => item.round || 0));
  const cachedLatest = byRound.get(cachedMax);
  const latest = await fetchRoundReliable();

  if (!latest) throw new Error("Latest lottery result could not be parsed.");
  byRound.set(latest.round, latest);

  if (latest.round <= cachedMax && isCompleteThrough(rounds, cachedMax) && sameRound(latest, cachedLatest)) {
    console.log(`Already up to date: ${cachedMax} rounds cached.`);
    await writeSummary(`### Lottery data\n\nAlready up to date: ${cachedMax} rounds cached.`);
    return;
  }

  const startRound = isCompleteThrough(rounds, cachedMax) ? cachedMax + 1 : 1;
  const endRound = Math.max(latest.round, cachedMax);

  for (let round = startRound; round <= endRound; round += 1) {
    if (byRound.has(round)) continue;
    const parsed = await fetchRoundReliable(round);
    if (parsed) byRound.set(parsed.round, parsed);
    await sleep(250);
  }

  const nextRounds = [...byRound.values()]
    .filter((item) => item.round && item.group && item.digits?.length === 6 && item.bonus?.length === 6)
    .sort((a, b) => a.round - b.round)
    .map(({ round, group, digits, bonus, drawDate }) => ({ round, group, digits, bonus, drawDate }));

  const maxRound = Math.max(0, ...nextRounds.map((item) => item.round || 0));
  if (!isCompleteThrough(nextRounds, maxRound)) {
    throw new Error(`Refusing to write incomplete lottery data through round ${maxRound}.`);
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    source: OFFICIAL_URL,
    rounds: nextRounds
  };

  await writeFile(DATA_FILE, `${JSON.stringify(payload)}\n`, "utf8");
  console.log(`Updated winners.json: ${nextRounds.length} rounds cached.`);
  await writeSummary(`### Lottery data\n\nUpdated winners.json: ${nextRounds.length} rounds cached. Latest round: ${maxRound}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

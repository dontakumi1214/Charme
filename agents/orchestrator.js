/**
 * Multi-Agent Orchestrator
 *
 * 実行フロー:
 *   Planner → [Generator → Evaluator (→ Generator修正)] × スプリント数 → Marketing
 *
 * 使い方:
 *   node orchestrator.js "2Dレトロゲームメーカーを作って"
 *   node orchestrator.js "2Dレトロゲームメーカー" --output ./my-app --server http://localhost:3000
 */

import fs from "fs/promises";
import path from "path";
import { runPlanner } from "./planner.js";
import { runGenerator } from "./generator.js";
import { runEvaluator } from "./evaluator.js";
import { runMarketing } from "./marketing.js";

const MAX_RETRY_PER_SPRINT = 2;

function parseArgs(argv) {
  const args = { prompt: "", output: "./output", server: null, sprints: null };
  let i = 2;
  while (i < argv.length) {
    if (argv[i] === "--output" || argv[i] === "-o") {
      args.output = argv[++i];
    } else if (argv[i] === "--server" || argv[i] === "-s") {
      args.server = argv[++i];
    } else if (argv[i] === "--sprints") {
      args.sprints = parseInt(argv[++i]);
    } else {
      args.prompt += (args.prompt ? " " : "") + argv[i];
    }
    i++;
  }
  return args;
}

async function saveJSON(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.prompt) {
    console.error("使い方: node orchestrator.js <プロンプト> [--output <dir>] [--server <url>]");
    process.exit(1);
  }

  const runId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outputDir = path.join(args.output, runId);
  await fs.mkdir(outputDir, { recursive: true });

  const log = {
    run_id: runId,
    prompt: args.prompt,
    started_at: new Date().toISOString(),
    spec: null,
    sprints: [],
    marketing: null,
    completed: false,
  };

  console.log("\n╔══════════════════════════════════════╗");
  console.log("║     Multi-Agent Orchestrator         ║");
  console.log("╚══════════════════════════════════════╝\n");
  console.log(`プロンプト: "${args.prompt}"`);
  console.log(`出力先: ${outputDir}\n`);

  // ─── Phase 1: Planner ───────────────────────────────────────────
  console.log("── Phase 1: Planner ──────────────────");
  const spec = await runPlanner(args.prompt);
  log.spec = spec;
  await saveJSON(path.join(outputDir, "spec.json"), spec);
  console.log();

  const targetSprints = args.sprints
    ? spec.sprints.slice(0, args.sprints)
    : spec.sprints;

  const generatorResults = [];

  // ─── Phase 2: Generator + Evaluator loop ────────────────────────
  for (const sprint of targetSprints) {
    console.log(`── Phase 2-${sprint.id}: Sprint ${sprint.id} / ${sprint.name} ──`);

    const sprintLog = {
      sprint_id: sprint.id,
      sprint_name: sprint.name,
      attempts: [],
      passed: false,
    };

    let generatorResult = null;
    let evalResult = null;
    let feedback = null;

    for (let attempt = 1; attempt <= MAX_RETRY_PER_SPRINT + 1; attempt++) {
      if (attempt > 1) {
        console.log(`  → リトライ ${attempt - 1}回目 (フィードバック反映)`);
      }

      // Generator
      generatorResult = await runGenerator(
        spec,
        sprint.id,
        path.join(outputDir, "src"),
        generatorResults,
        feedback
      );
      await saveJSON(
        path.join(outputDir, `sprint_${sprint.id}_attempt_${attempt}_gen.json`),
        generatorResult
      );

      // Evaluator
      evalResult = await runEvaluator(spec, generatorResult, args.server);
      await saveJSON(
        path.join(outputDir, `sprint_${sprint.id}_attempt_${attempt}_eval.json`),
        evalResult
      );

      sprintLog.attempts.push({ attempt, passed: evalResult.passed, scores: evalResult.scores });

      if (evalResult.passed) {
        sprintLog.passed = true;
        console.log(`  ✅ Sprint ${sprint.id} 合格 (attempt ${attempt})\n`);
        break;
      }

      if (attempt <= MAX_RETRY_PER_SPRINT) {
        feedback = evalResult.feedback_for_generator;
        console.log(`  ⚠️  不合格 → フィードバックで修正します\n`);
      } else {
        console.log(`  ⛔ Sprint ${sprint.id}: 最大リトライ超過、次のスプリントへ進みます\n`);
      }
    }

    log.sprints.push(sprintLog);
    generatorResults.push(generatorResult);
  }

  await saveJSON(path.join(outputDir, "progress.json"), log);

  // ─── Phase 3: Marketing ─────────────────────────────────────────
  console.log("── Phase 3: Marketing ────────────────");
  const completedSprints = targetSprints.filter((_, i) => log.sprints[i]?.passed);
  const marketing = await runMarketing(spec, completedSprints);
  log.marketing = marketing;
  await saveJSON(path.join(outputDir, "marketing.json"), marketing);
  console.log();

  // ─── Summary ────────────────────────────────────────────────────
  log.completed = true;
  log.finished_at = new Date().toISOString();
  await saveJSON(path.join(outputDir, "summary.json"), log);

  const passedCount = log.sprints.filter((s) => s.passed).length;
  console.log("╔══════════════════════════════════════╗");
  console.log("║            実行完了                  ║");
  console.log("╚══════════════════════════════════════╝");
  console.log(`製品名    : ${spec.title}`);
  console.log(`タグライン: ${marketing.tagline}`);
  console.log(`スプリント: ${passedCount} / ${targetSprints.length} 合格`);
  console.log(`出力先    : ${outputDir}`);
}

main().catch((err) => {
  console.error("エラー:", err.message);
  process.exit(1);
});

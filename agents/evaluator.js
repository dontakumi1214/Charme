import Anthropic from "@anthropic-ai/sdk";
import { chromium } from "playwright";
import fs from "fs/promises";

const client = new Anthropic();

const SYSTEM_PROMPT = `あなたはQAエンジニアです。
アプリケーションのテスト結果を分析し、合否判定とフィードバックを提供してください。

## 評価基準（各0〜10点、閾値未満で不合格）

| 基準 | 閾値 | 説明 |
|------|------|------|
| functional | 7 | 機能要件をすべて満たしているか |
| ui_ux | 6 | UIが直感的で使いやすいか |
| error_handling | 6 | エラー時に適切なメッセージが表示されるか |
| performance | 6 | 操作に対してレスポンスが速いか |
| accessibility | 5 | スクリーンリーダーやキーボード操作に対応しているか |

## 出力形式（必ずこのJSONで返すこと）

{
  "sprint_id": 1,
  "passed": true,
  "scores": {
    "functional": 8,
    "ui_ux": 7,
    "error_handling": 6,
    "performance": 7,
    "accessibility": 5
  },
  "failed_criteria": [],
  "bugs": [
    {
      "severity": "HIGH|MEDIUM|LOW",
      "description": "バグの説明",
      "steps_to_reproduce": "再現手順",
      "expected": "期待される動作",
      "actual": "実際の動作"
    }
  ],
  "improvements": ["改善提案1", "改善提案2"],
  "feedback_for_generator": "Generatorへの具体的なフィードバック（修正が必要な場合）"
}`;

const THRESHOLDS = {
  functional: 7,
  ui_ux: 6,
  error_handling: 6,
  performance: 6,
  accessibility: 5,
};

async function runBrowserTests(url, features) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const testResults = [];
  const consoleErrors = [];
  const networkErrors = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  page.on("requestfailed", (req) => {
    networkErrors.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
  });

  try {
    const startTime = Date.now();
    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
    const loadTime = Date.now() - startTime;

    testResults.push({ test: "ページ読み込み", passed: true, detail: `${loadTime}ms` });

    // スクリーンショット取得
    const screenshot = await page.screenshot({ type: "png" });
    const screenshotBase64 = screenshot.toString("base64");

    // acceptance_criteriaベースのテスト
    for (const feature of features) {
      for (const criteria of feature.acceptance_criteria) {
        testResults.push({
          test: `[${feature.id}] ${criteria}`,
          passed: null, // AIが判定
          detail: "要目視確認",
        });
      }
    }

    await browser.close();
    return { testResults, consoleErrors, networkErrors, screenshotBase64, loadTime };
  } catch (err) {
    await browser.close();
    return {
      testResults: [{ test: "ページ読み込み", passed: false, detail: err.message }],
      consoleErrors,
      networkErrors,
      screenshotBase64: null,
      loadTime: null,
    };
  }
}

export async function runEvaluator(spec, generatorResult, serverUrl = null) {
  const sprint = spec.sprints.find((s) => s.id === generatorResult.sprint_id);
  const features = spec.features.filter((f) =>
    generatorResult.feature_ids.includes(f.id)
  );

  let browserData = null;
  if (serverUrl) {
    console.log(`[Evaluator] ブラウザテスト開始: ${serverUrl}`);
    browserData = await runBrowserTests(serverUrl, features);
    console.log(
      `[Evaluator] ブラウザテスト完了: エラー ${browserData.consoleErrors.length}件`
    );
  }

  const evalContext = {
    spec_title: spec.title,
    sprint: { id: sprint.id, name: sprint.name, goal: sprint.goal },
    features,
    generator_self_evaluation: generatorResult.self_evaluation,
    implemented_files: generatorResult.files.map((f) => f.path),
    browser_test: browserData
      ? {
          results: browserData.testResults,
          console_errors: browserData.consoleErrors,
          network_errors: browserData.networkErrors,
          load_time_ms: browserData.loadTime,
        }
      : null,
  };

  const messages = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `## 製品仕様書\n${JSON.stringify(spec, null, 2)}`,
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: `## 評価コンテキスト\n${JSON.stringify(evalContext, null, 2)}\n\n上記の情報を元に評価してください。`,
        },
      ],
    },
  ];

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages,
  });

  const text = response.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("評価結果のJSONが見つかりません");

  const evalResult = JSON.parse(jsonMatch[0]);

  // 閾値チェック
  const failedCriteria = Object.entries(evalResult.scores)
    .filter(([key, score]) => THRESHOLDS[key] !== undefined && score < THRESHOLDS[key])
    .map(([key, score]) => `${key}: ${score} < ${THRESHOLDS[key]}`);

  evalResult.failed_criteria = failedCriteria;
  evalResult.passed = failedCriteria.length === 0;

  const status = evalResult.passed ? "✅ 合格" : "❌ 不合格";
  console.log(`[Evaluator] Sprint ${generatorResult.sprint_id} 評価: ${status}`);
  if (!evalResult.passed) {
    console.log(`  不合格基準: ${failedCriteria.join(", ")}`);
  }
  console.log(`  バグ件数: ${evalResult.bugs.length}`);

  return evalResult;
}

if (process.argv[2] && process.argv[3]) {
  const specPath = process.argv[2];
  const resultPath = process.argv[3];
  const serverUrl = process.argv[4];

  const spec = JSON.parse(await fs.readFile(specPath, "utf-8"));
  const generatorResult = JSON.parse(await fs.readFile(resultPath, "utf-8"));

  const evalResult = await runEvaluator(spec, generatorResult, serverUrl);
  console.log("\n=== 評価結果 ===");
  console.log(JSON.stringify(evalResult, null, 2));
}

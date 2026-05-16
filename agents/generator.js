import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";

const client = new Anthropic();

const SYSTEM_PROMPT = `あなたはシニアソフトウェアエンジニアです。
製品仕様書のスプリントタスクを1つずつ実装してください。

## 実装ルール
- 既存コードとの整合性を必ず保つ
- 各ファイルは完全な状態で出力する（差分ではなく全体）
- テストが書ける機能にはテストも含める
- コードにはコメントを適切に入れる

## 自己評価
実装後、以下の基準で自己評価（0〜10点）を行う:
- 機能完成度: 仕様の全acceptance_criteriaを満たしているか
- コード品質: 可読性、保守性、エラーハンドリング
- テストカバレッジ: 主要なパスがテストされているか

## 出力形式（必ずこのJSONで返すこと）

{
  "sprint_id": 1,
  "feature_ids": ["F001"],
  "files": [
    {
      "path": "相対ファイルパス",
      "content": "ファイルの完全な内容"
    }
  ],
  "self_evaluation": {
    "completeness": 8,
    "code_quality": 7,
    "test_coverage": 6,
    "notes": "自己評価のコメント",
    "concerns": ["懸念点1", "懸念点2"]
  },
  "next_sprint_notes": "次のスプリントへの引き継ぎ事項"
}`;

export async function runGenerator(spec, sprintId, outputDir, previousResults = [], feedback = null) {
  const sprint = spec.sprints.find((s) => s.id === sprintId);
  if (!sprint) throw new Error(`Sprint ${sprintId} が見つかりません`);

  const features = spec.features.filter((f) =>
    sprint.feature_ids.includes(f.id)
  );

  const previousContext =
    previousResults.length > 0
      ? `\n## 前のスプリントの成果物\n${JSON.stringify(previousResults, null, 2)}`
      : "";

  const feedbackContext = feedback
    ? `\n\n## Evaluatorからのフィードバック（必ず反映すること）\n${feedback}`
    : "";

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
          text: `${previousContext}${feedbackContext}\n\n## 実装するスプリント\nスプリント${sprintId}: ${sprint.name}\nゴール: ${sprint.goal}\n\n実装する機能:\n${JSON.stringify(features, null, 2)}\n\n上記の機能を実装してください。`,
        },
      ],
    },
  ];

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 8192,
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
  if (!jsonMatch) throw new Error("実装結果のJSONが見つかりません");

  const result = JSON.parse(jsonMatch[0]);

  // ファイルを出力ディレクトリに書き出す
  for (const file of result.files) {
    const filePath = path.join(outputDir, file.path);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, file.content, "utf-8");
  }

  const avg = (
    (result.self_evaluation.completeness +
      result.self_evaluation.code_quality +
      result.self_evaluation.test_coverage) /
    3
  ).toFixed(1);

  console.log(`[Generator] Sprint ${sprintId} 実装完了`);
  console.log(`  生成ファイル数: ${result.files.length}`);
  console.log(`  自己評価 平均: ${avg}/10`);
  if (result.self_evaluation.concerns.length > 0) {
    console.log(`  懸念点: ${result.self_evaluation.concerns.join(", ")}`);
  }

  return result;
}

if (process.argv[2] && process.argv[3]) {
  const specPath = process.argv[2];
  const sprintId = parseInt(process.argv[3]);
  const outputDir = process.argv[4] || "./output";

  const spec = JSON.parse(await fs.readFile(specPath, "utf-8"));
  const result = await runGenerator(spec, sprintId, outputDir);
  console.log("\n=== 実装結果 ===");
  console.log(JSON.stringify(result.self_evaluation, null, 2));
}

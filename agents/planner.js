import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SYSTEM_PROMPT = `あなたはプロダクトプランナーです。
短いプロンプト（1〜4行）を受け取り、詳細な製品仕様書を生成してください。

## 出力形式（必ずこのJSONで返すこと）

{
  "title": "プロダクト名",
  "overview": "概要（2〜3文）",
  "target_users": ["ターゲットユーザー1", "ターゲットユーザー2"],
  "features": [
    {
      "id": "F001",
      "name": "機能名",
      "description": "機能の説明（何を実現するか）",
      "priority": "HIGH|MEDIUM|LOW",
      "acceptance_criteria": ["完了基準1", "完了基準2"]
    }
  ],
  "sprints": [
    {
      "id": 1,
      "name": "スプリント名",
      "goal": "スプリントゴール",
      "feature_ids": ["F001", "F002"],
      "estimated_days": 3
    }
  ],
  "constraints": ["制約事項1", "制約事項2"],
  "out_of_scope": ["スコープ外1", "スコープ外2"]
}

## ルール
- 機能は8〜20個定義する
- スプリントは4〜10個に分割する
- 技術的な実装詳細（DB設計、API設計、ライブラリ選定など）は含めない
- 「何を作るか」に集中し、「どう作るか」は含めない
- 各機能は独立して評価可能な粒度にする`;

export async function runPlanner(prompt) {
  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `以下のプロンプトから製品仕様書を生成してください:\n\n${prompt}`,
      },
    ],
  });

  const text = response.content[0].text;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("仕様書のJSONが見つかりません");

  const spec = JSON.parse(jsonMatch[0]);

  console.log(`[Planner] 仕様書生成完了: ${spec.title}`);
  console.log(`  機能数: ${spec.features.length}`);
  console.log(`  スプリント数: ${spec.sprints.length}`);

  return spec;
}

if (process.argv[2]) {
  const prompt = process.argv.slice(2).join(" ");
  const spec = await runPlanner(prompt);
  console.log("\n=== 生成された仕様書 ===");
  console.log(JSON.stringify(spec, null, 2));
}

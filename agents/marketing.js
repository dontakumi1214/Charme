import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";

const client = new Anthropic();

const SYSTEM_PROMPT = `あなたはプロダクトマーケターです。
製品仕様書と実装済み機能の情報をもとに、効果的なマーケティング素材を生成してください。

## 生成するコンテンツ

1. **ランディングページコピー** - キャッチコピー、ヒーローセクション、機能紹介文、CTA
2. **SNS投稿文** - X(Twitter)、Instagram、LinkedIn向けの投稿（各3パターン）
3. **メールキャンペーン** - 件名5案 + 本文テンプレート（ウェルカム・機能紹介・再エンゲージメント）
4. **SEOメタ情報** - titleタグ、meta description、OGP、キーワード30個
5. **プレスリリース** - 500字程度の発表文
6. **競合比較表** - 想定される競合との比較ポイント

## 出力形式（必ずこのJSONで返すこと）

{
  "product_name": "製品名",
  "tagline": "キャッチコピー（20字以内）",
  "landing_page": {
    "hero": {
      "headline": "メインキャッチコピー",
      "subheadline": "サブキャッチコピー",
      "cta_primary": "メインCTAボタンテキスト",
      "cta_secondary": "サブCTAボタンテキスト"
    },
    "value_propositions": [
      { "icon": "絵文字", "title": "価値提案タイトル", "description": "説明文" }
    ],
    "feature_highlights": [
      { "feature_name": "機能名", "marketing_copy": "マーケティングコピー" }
    ],
    "social_proof": "社会的証明テキスト（実績・数字など）"
  },
  "sns": {
    "twitter": ["投稿1（140字以内）", "投稿2", "投稿3"],
    "instagram": ["投稿1（改行含む）", "投稿2", "投稿3"],
    "linkedin": ["投稿1（ビジネス向け）", "投稿2", "投稿3"]
  },
  "email": {
    "subject_lines": ["件名1", "件名2", "件名3", "件名4", "件名5"],
    "welcome": { "subject": "件名", "body": "メール本文" },
    "feature_intro": { "subject": "件名", "body": "メール本文" },
    "re_engagement": { "subject": "件名", "body": "メール本文" }
  },
  "seo": {
    "title": "titleタグ（60字以内）",
    "description": "meta description（160字以内）",
    "og_title": "OGタイトル",
    "og_description": "OG説明文",
    "keywords": ["キーワード1", "キーワード2"]
  },
  "press_release": "プレスリリース本文",
  "competitor_comparison": [
    {
      "competitor": "競合名（仮）",
      "our_advantage": "自社の優位点",
      "their_strength": "競合の強み"
    }
  ],
  "launch_checklist": ["公開前チェック項目1", "公開前チェック項目2"]
}`;

export async function runMarketing(spec, completedSprints = [], targetAudience = null) {
  const completedFeatureIds = completedSprints.flatMap((s) => s.feature_ids || []);
  const completedFeatures = spec.features.filter((f) =>
    completedFeatureIds.includes(f.id)
  );

  const audienceContext = targetAudience
    ? `\n\n## ターゲットオーディエンス補足\n${targetAudience}`
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
          text: `## 実装済み機能（${completedFeatures.length}件）\n${JSON.stringify(completedFeatures, null, 2)}${audienceContext}\n\n上記の情報をもとにマーケティング素材を生成してください。`,
        },
      ],
    },
  ];

  console.log(`[Marketing] マーケティング素材生成開始: ${spec.title}`);

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
  if (!jsonMatch) throw new Error("マーケティング素材のJSONが見つかりません");

  const materials = JSON.parse(jsonMatch[0]);

  console.log(`[Marketing] 生成完了: ${materials.tagline}`);
  console.log(`  SNS投稿数: X:${materials.sns?.twitter?.length} / IG:${materials.sns?.instagram?.length} / LI:${materials.sns?.linkedin?.length}`);
  console.log(`  メール件名案: ${materials.email?.subject_lines?.length}件`);
  console.log(`  SEOキーワード: ${materials.seo?.keywords?.length}個`);

  return materials;
}

if (process.argv[2]) {
  const specPath = process.argv[2];
  const targetAudience = process.argv[3];

  const spec = JSON.parse(await fs.readFile(specPath, "utf-8"));
  const materials = await runMarketing(spec, [], targetAudience);

  const outPath = specPath.replace(".json", "_marketing.json");
  await fs.writeFile(outPath, JSON.stringify(materials, null, 2), "utf-8");
  console.log(`\n=== マーケティング素材を保存: ${outPath} ===`);
  console.log(`タグライン: ${materials.tagline}`);
  console.log(`キャッチコピー: ${materials.landing_page?.hero?.headline}`);
}

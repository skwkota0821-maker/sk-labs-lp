# SK LABS Harness 会員制Web統合設計

作成日：2026年8月22日

## 目的

WebをSK LABS Harnessの中核チャネルとして位置づけ、X・Instagram・LINE・note・メール・Stripe・Google Drive・n8nを共通の顧客ID、CRM、イベント、コンテンツ、売上データで接続する。

## 会員制Webの役割

- SK LABS所有のファーストパーティ顧客基盤
- ログイン後の会員ポータル
- 購入履歴・契約状態・配布物・限定記事の集約
- X / Instagram / LINE / note / メールの接点統合
- Stripe購入情報との紐付け
- UTM・流入元・コンバージョンの保持
- 会員ごとのタグ、権限、スコア、行動履歴の管理
- AI / MCP / n8nから操作できる共通APIの入口

## 推奨アーキテクチャ

### Harness Core

- 会員ID
- 外部IDマッピング
- CRM
- タグ
- イベント
- トリガー
- キャンペーン
- ステップ配信
- コンテンツ
- 商品・購入状態
- KPI / アトリビューション
- 権限
- 承認
- 監査ログ

### Web会員機能

- 新規登録
- ログイン / ログアウト
- パスワード再設定またはパスキー対応
- マイページ
- 購入済み商品一覧
- 限定コンテンツ
- 無料配布物
- お知らせ
- プロフィール
- LINE / X / Instagram / note 連携状態
- メール設定
- 退会・データ削除申請

### 会員ランク

初期実装では複雑化を避け、次の3段階を推奨する。

1. 無料会員
2. 有料会員
3. 購入商品別アクセス権

会員ランクと商品アクセス権を分離し、後からCreator、Publishing、マンガ、教材、コミュニティ等を追加できる構造にする。

## 顧客ID設計

内部のSK LABS会員IDを正本とし、外部サービスIDを従属させる。

- sk_member_id
- email
- stripe_customer_id
- x_user_id
- instagram_user_id
- line_user_id
- note_user_id または取得可能な識別子

外部サービスIDを主キーにしない。

## 主要イベント

- member.created
- member.logged_in
- lead.captured
- content.viewed
- content.downloaded
- cta.clicked
- line.connected
- social.connected
- checkout.started
- purchase.completed
- subscription.started
- subscription.renewed
- subscription.canceled
- access.granted
- access.revoked

## セキュリティ原則

- 認証情報をGitHubへ保存しない
- 秘密情報は環境変数 / Secret Storeへ置く
- 決済情報をSK LABS側で直接保持しない
- Stripe Webhookは署名検証する
- 会員権限判定はサーバー側で行う
- 管理者操作は監査ログへ残す
- 外部ID連携は本人確認済みフローを通す
- 退会とデータ削除の導線を用意する

## 実装優先順位

1. 会員ID・認証
2. マイページ
3. Stripe購入状態連携
4. 商品別アクセス制御
5. イベントログ
6. LINE連携
7. X / Instagram / note連携
8. 統合CRM
9. MCP / n8n共通操作
10. KPI・アトリビューション

## 初期MVP

最初のMVPでは、以下までを完成条件とする。

- 会員登録・ログイン
- マイページ
- Stripe購入済み商品の表示
- 商品別限定ページ
- 無料配布物
- イベント記録
- 管理者が会員状態を確認できること
- n8nへイベント通知できるWebhook

## 将来拡張

- AIパーソナライズ
- 顧客スコアリング
- リコメンド
- 会員別ダッシュボード
- 紹介プログラム
- ポイント
- コミュニティ
- サブスクリプション
- TikTok / YouTube / Threads連携
- B2B顧客ポータル

## 方針

Webは単なるLPではなく、SK LABSが所有する顧客・販売・コンテンツの中核資産とする。

SNSは集客チャネル、Webは顧客資産の正本、Stripeは決済正本、Google Driveは制作資産の正本、n8nは自動化オーケストレーターとして役割を分離する。

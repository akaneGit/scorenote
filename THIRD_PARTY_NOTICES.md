# ScoreNote — 使用ライブラリ・フォントのライセンス

配布HTMLには以下のライブラリとフォントを同梱しています。各ライセンスの正式な条件と著作権表示は、記載したファイルの原文を参照してください。

- PDF.js / pdfjs-dist 6.3.289 — Apache License 2.0。https://github.com/mozilla/pdf.js — `licenses/pdfjs-dist-LICENSE`
- pdf-lib 1.17.1 — MIT。https://github.com/Hopding/pdf-lib — `licenses/pdf-lib-LICENSE.md`
- @pdf-lib/fontkit 1.1.1 — MIT。https://github.com/Hopding/fontkit — `licenses/fontkit-MIT.txt`。同梱コードの著作権・ライセンス表記は `licenses/fontkit-bundled-notices.txt` に収録しています。
- Zen Kaku Gothic New — SIL Open Font License 1.1。https://github.com/google/fonts/tree/main/ofl/zenkakugothicnew — `assets/OFL-ZenKakuGothicNew.txt`
- その他の実行時依存ライブラリ：@pdf-lib/standard-fonts（MIT）、@pdf-lib/upng（MIT）、pako（MIT/Zlib）、tslib（0BSD）。各ライセンス原文は `licenses/` に収録しています。

ビルド・テスト用の依存関係は `package-lock.json` に記録しています。インストール後の各パッケージにライセンス原文が含まれています。

アプリ本体のMITライセンスは、入力・出力する楽譜の利用許諾を与えるものではありません。

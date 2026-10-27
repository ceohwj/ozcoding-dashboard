#!/usr/bin/env bash
# 이 프로젝트의 구조를 그대로 복제해 새 대시보드 프로젝트를 만든다.
# 사용: bash scripts/new-dashboard.sh <대상폴더> <구글시트ID> [프로젝트이름]
# 복제 제외: data/ 안의 내용, docs/ 의 작성 내용(빈 뼈대로 새로 생성), .git
set -euo pipefail

TARGET="${1:?대상 폴더가 필요하다}"
SHEET_ID="${2:?구글 시트 ID가 필요하다}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

mkdir -p "$TARGET"
TARGET="$(cd "$TARGET" && pwd)"
NAME="${3:-$(basename "$TARGET")}"
[ "$TARGET" != "$SRC" ] || { echo "원본과 같은 폴더에는 만들 수 없다" >&2; exit 1; }
[ -z "$(ls -A "$TARGET")" ] || { echo "대상 폴더가 비어 있지 않다: $TARGET" >&2; exit 1; }

# 구조 복제 (data/, docs/, .git, node_modules 제외)
(cd "$SRC" && find . -type f ! -name .DS_Store \
  ! -path './data/*' ! -path './docs/*' ! -path './.git/*' ! -path './node_modules/*' -print0) |
while IFS= read -r -d '' f; do
  mkdir -p "$TARGET/$(dirname "$f")"
  cp "$SRC/$f" "$TARGET/$f"
done

mkdir -p "$TARGET/data/raw" "$TARGET/data/processed" "$TARGET/docs"
touch "$TARGET/data/raw/.gitkeep" "$TARGET/data/processed/.gitkeep"

# 이름/시트 ID 반영
sed -i '' -e "s|\"name\": \".*\"|\"name\": \"$NAME\"|" -e "s|\"sheetId\": \".*\"|\"sheetId\": \"$SHEET_ID\"|" "$TARGET/project.config.json"
sed -i '' -e "1s|.*|# $NAME|" "$TARGET/README.md" "$TARGET/CLAUDE.md"
sed -i '' -e "s|<title>.*</title>|<title>$NAME</title>|" -e "s|<h1>.*</h1>|<h1>$NAME</h1>|" "$TARGET/src/index.html"

# 빈 docs 뼈대
cat > "$TARGET/docs/brief.md" <<'EOF'
# 대시보드 브리프

> 인터뷰로 채운다. 비어 있는 항목은 미확정.

## 1. 목적과 사용자
## 2. 핵심 지표(KPI)
## 3. 분석 축과 필터
## 4. 화면 구성
## 5. 기술/형태/갱신 방식
## 6. 디자인
## 7. 범위 밖
EOF
printf '# 결정 기록\n\n| 날짜 | 결정 | 이유 |\n|---|---|---|\n' > "$TARGET/docs/decisions.md"
printf '# 데이터 사전\n\n> `node scripts/fetch-data.mjs` 후 `data/raw/*.csv` 기준으로 채운다.\n\n## 테이블\n\n## 조인 관계\n\n## 컬럼 주의사항\n' > "$TARGET/docs/data-dictionary.md"

echo "created: $TARGET"

ARCHIVE CMS 연결 안내
====================

연결된 Apps Script Web App
https://script.google.com/macros/s/AKfycbwiZsgp3l-qoRFRDM0iwQwcONKoIyenzNhCHdbx0fBI41F6q1_NBum17fccVgPa5Lpx/exec

현재 상태
- Archive 화면은 위 API에서 게시물을 자동으로 불러옵니다.
- POSTS 시트의 Status가 Draft인 행은 공개되지 않습니다.
- 공개 게시물이 0개이면 "The first research entry is being prepared."가 표시됩니다.

첫 게시물 테스트
1. Google Sheets의 POSTS 탭을 엽니다.
2. 샘플 행의 Status를 Published로 바꿉니다.
3. Publish Date를 오늘 또는 과거 날짜로 설정합니다.
4. 필수값(Title, Slug, Activity Year, Content Type, Research Theme)을 확인합니다.
5. 저장 후 최대 5분을 기다리거나 Apps Script에서 clearCmsCache 함수를 실행합니다.
6. 배포한 홈페이지의 archive.html을 새로고침합니다.

운영 참고
- 시트 내용만 수정할 때는 Apps Script를 다시 배포할 필요가 없습니다.
- Apps Script 코드 자체를 수정한 경우에는 배포 관리에서 새 버전으로 업데이트합니다.
- 이미지 URL은 공개적으로 접근 가능한 URL이어야 홈페이지에서 표시됩니다.
- vercel.json은 /archive/게시물-slug 형태의 상세주소를 archive.html로 연결합니다.

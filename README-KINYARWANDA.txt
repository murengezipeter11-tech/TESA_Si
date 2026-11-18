TESASI + Claude AI — uko ubishyira kuri Vercel

IBIRI MURI PACKAGE
- index.html: file ya TESASI wohereje, yahinduwe kugira ngo chat ibanze ikoreshe /api/chat.
- api/chat.js: backend ya Vercel ihuza TESASI na Claude Sonnet 5.5.

INTAMBWE
1. Kuramo files muri ZIP.
2. Muri project yawe ya TESASI kuri GitHub cyangwa VS Code, usimbuze index.html ya kera na iyi index.html.
3. Ongeramo folder yitwa api ku rwego rumwe na index.html, hanyuma ushyiremo chat.js muri api/.
   Imiterere igomba kuba:
      index.html
      api/chat.js
4. Kuri Vercel, fungura project ya TESASI -> Settings -> Environment Variables.
5. Ongeramo environment variable:
      Name: ANTHROPIC_API_KEY
      Value: API Key yawe ya Anthropic
   Ntushyire API Key muri HTML, JavaScript igaragara kuri browser, cyangwa muri GitHub.
6. Kanda Save, hanyuma ukore Redeploy ya project.
7. Fungura TESASI -> Settings -> Connectors / Si connection.
   Chat API endpoint igomba kuba /api/chat. Kanda Save, hanyuma Test.
8. Garuka kuri chat, wohereze ikibazo mu Kinyarwanda cyangwa mu Cyongereza.

ICYITONDERWA
- Backend ikoresha model ID claude-sonnet-5-5.
- API Key ibikwa kuri Vercel server gusa; ntigaragara muri browser.
- ANTHROPIC_WORKSPACE_ID ni optional. Yishyire muri Vercel gusa niba Anthropic ikubwiye ko API key yawe isaba workspace ID.
- /api/chat ni API endpoint yakira POST request, si page yo gufungura muri browser.
- Niba uri gukoresha billing cyangwa gutangiza serivisi igaragarira abantu, saba umuntu mukuru wizewe kugufasha kureba uburyo konti ikoreshwa n'imbibi z'amafaranga.

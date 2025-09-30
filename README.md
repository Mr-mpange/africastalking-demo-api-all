# Africa's Talking Sandbox Suite (Node.js)

This project demonstrates 1-way SMS, 2-way SMS webhook, Bulk SMS, USSD, Voice, Airtime, and WhatsApp using Africa's Talking Sandbox.
It also includes scaffolding for WhatsApp (inbound webhook and outbound send) via Africa's Talking WhatsApp product.

## Prerequisites
- Node.js 18+
- Africa's Talking account (Sandbox)
- Ngrok (for webhooks)

## Setup
1. Clone or open this project in your IDE.
2. Create a `.env` file based on `.env.example` and fill:
   - `AT_USERNAME=sandbox`
   - `AT_API_KEY=your_sandbox_api_key`
   - Optionally adjust `PORT` (default 3000)
   - For WhatsApp, fill (when available in your account):
     - `AT_WHATSAPP_API_URL` (e.g., `https://content.africastalking.com/whatsapp/send`)
     - `AT_WHATSAPP_SENDER` (your WhatsApp-enabled number or sender identifier)
     - `AT_WHATSAPP_WEBHOOK_SECRET` (optional, if AT provides signature verification)
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run the server:
   ```bash
   npm run dev
   # or
   npm start
   ```
5. Health check: open http://localhost:3000/health

## Ngrok (for webhooks)
Expose your local server:
```bash
ngrok http 3000
```
Copy the https URL, e.g. `https://abc123.ngrok.io`

### Configure Callbacks in Africa's Talking Sandbox Dashboard
- SMS (2-way inbound): set the Inbound Callback URL to `https://<ngrok>/sms/inbound`
- USSD: set the Service Callback URL to `https://<ngrok>/ussd`
- Voice:
  - Events URL: `https://<ngrok>/voice/events`
  - Actions URL: `https://<ngrok>/voice/actions`
- WhatsApp:
  - Inbound/Webhook URL: `https://<ngrok>/whatsapp/webhook`

Note: exact placement may vary in the dashboard under products' settings.

## Endpoints

### SMS
- POST `/sms/send`
  - Body: `{ "to": "+254700000000" | ["+254700000000", ...], "message": "Hello", "from": "SENDER_ID_OR_SHORTCODE(optional)" }`
- POST `/sms/bulk`
  - Body: `{ "recipients": ["+254700000001", "+254700000002"], "message": "Hi all", "from": "optional" }`
- POST `/sms/inbound` (webhook from AT)
  - AT posts fields: `text, from, to, date, id, linkId`
  - Responds `200 OK` quickly. We also try an auto-ack.

### USSD
- POST `/ussd`
  - AT posts: `sessionId, serviceCode, phoneNumber, text`
  - Respond with strings starting with `CON` to continue, or `END` to finish.

### Voice
- POST `/voice/call`
  - Body: `{ "callFrom": "+254711000000", "callTo": "+254700000000" }`
  - Initiates a call via AT Voice.
- POST `/voice/events` (webhook)
- POST `/voice/actions` (instructions). Returns simple XML-ish response.

### Airtime
- POST `/airtime/send`
  - Body: `{ "phoneNumber": "+254700000000", "amount": "10", "currencyCode": "KES" }`

### WhatsApp
- POST `/whatsapp/send`
  - Body: `{ "to": "+254700000000" | ["+254700000000", ...], "message": "Hello via WhatsApp", "mediaUrl": "optional", "template": { ... } }`
  - Uses `AT_WHATSAPP_API_URL` and `AT_WHATSAPP_SENDER` env vars. Requires WhatsApp product access in your AT account.
- POST `/whatsapp/webhook` (webhook from AT WhatsApp)
  - Configure this in the AT dashboard. We log events and return `200 OK`.
  - Optionally verify signature using `AT_WHATSAPP_WEBHOOK_SECRET` if provided by AT.

## Testing with curl (Windows PowerShell)

- 1-way SMS
```powershell
curl -Method POST -Uri http://localhost:3000/sms/send -Headers @{"Content-Type"="application/json"} -Body '{"to":"+254700000000","message":"Hello from sandbox"}'
```
- Bulk SMS
```powershell
curl -Method POST -Uri http://localhost:3000/sms/bulk -Headers @{"Content-Type"="application/json"} -Body '{"recipients":["+254700000001","+254700000002"],"message":"Hello bulk"}'
```
- Simulate inbound SMS (use ngrok URL when dashboard calls you)
```powershell
curl -Method POST -Uri http://localhost:3000/sms/inbound -Headers @{"Content-Type"="application/x-www-form-urlencoded"} -Body 'text=Hi&from=%2B254700000000&to=12345'
```
- USSD (local test)
```powershell
curl -Method POST -Uri http://localhost:3000/ussd -Headers @{"Content-Type"="application/x-www-form-urlencoded"} -Body 'sessionId=abc&serviceCode=%2A384%2A123%23&phoneNumber=%2B254700000000&text='
```
- Voice call (sandbox)
```powershell
curl -Method POST -Uri http://localhost:3000/voice/call -Headers @{"Content-Type"="application/json"} -Body '{"callFrom":"+254711000000","callTo":"+254700000000"}'
```
- Airtime (sandbox)
```powershell
curl -Method POST -Uri http://localhost:3000/airtime/send -Headers @{"Content-Type"="application/json"} -Body '{"phoneNumber":"+254700000000","amount":"10","currencyCode":"KES"}'
```
- WhatsApp Send (example)
```powershell
curl -Method POST -Uri http://localhost:3000/whatsapp/send -Headers @{"Content-Type"="application/json"} -Body '{
  "to": "+254700000000",
  "message": "Hello via WhatsApp"
}'
```
- WhatsApp Webhook (simulate)
```powershell
curl -Method POST -Uri http://localhost:3000/whatsapp/webhook -Headers @{"Content-Type"="application/json"} -Body '{
  "event": "message",
  "from": "+254700000000",
  "text": "Hi"
}'

## Notes
- Sandbox may restrict sender IDs, short codes, numbers, and airtime values.
- For 2-way SMS premium flow (subscriptions, linkId), additional setup is required.
- Ensure your `.env` is filled with correct sandbox API key and username.
- For WhatsApp, you need a WhatsApp-enabled sender and the correct REST endpoint from Africa's Talking. Contact AT support or check product docs.

// GET and POST /api/party: the rooms that let friends play Pass the globe live
// from their own phones. See ./_lib/party-room.ts.
import { handleParty } from './_lib/party-room.js'

export function GET(request: Request) {
  return handleParty(request)
}

export function POST(request: Request) {
  return handleParty(request)
}

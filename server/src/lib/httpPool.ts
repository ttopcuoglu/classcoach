import { Agent, setGlobalDispatcher } from 'undici'

// Keeps connections to Claude and Deepgram open between turns.
//
// Node's default is to close an idle connection after about four seconds.
// A spoken turn is nothing but waiting on those two services, and teachers
// pause for far longer than four seconds between turns, so nearly every
// first sentence was paying to open a fresh TLS connection before anything
// could be generated — measured at roughly 200-400ms, on top of work that
// already takes a second.
//
// Nothing here changes what is sent, only how long an unused connection is
// kept. The ceiling matters as much as the timeout: a connection a server
// has held for hours is likelier to have been dropped at the other end, and
// finding that out costs a retry at exactly the wrong moment.
export function keepConnectionsWarm(): void {
  setGlobalDispatcher(
    new Agent({
      keepAliveTimeout: 60_000,
      keepAliveMaxTimeout: 5 * 60_000,
    }),
  )
}

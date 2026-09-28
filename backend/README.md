# PocketWeek bank API

This folder contains the secure server side of PocketWeek's bank connection.

## Why this exists

The GitHub Pages app is public frontend code. Plaid secrets and access tokens must never be placed in `index.html`, the manifest, or any committed frontend JavaScript.

## Sandbox setup

1. Create a Plaid developer account and get Sandbox credentials.
2. Copy `.env.example` to `.env`.
3. Fill in `PLAID_CLIENT_ID` and `PLAID_SECRET`.
4. Run `npm install`.
5. Run `npm start`.
6. Set PocketWeek's API URL to this server.

The current storage is deliberately simple and intended for one-user Sandbox development. Before connecting real financial accounts, replace the local `.data` store with a secure persistent database/secret store and add authentication.

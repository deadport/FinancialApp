# FinancialApp

FinancialApp is a local-first desktop app for personal finance management.

It helps import bank statements, organize transactions into categories, review spending, and customize analysis charts.

## Status

This project is in early public build preparation.

Windows installer builds are published through GitHub Releases.

macOS builds require Apple Developer ID signing and notarization before they should be shared publicly.

## Privacy

FinancialApp stores user data locally on the user's computer. User data is not bundled with the application installer.

## Development

```bash
npm install
npm run build
npm start
```

## Releases

Release builds are created from version tags:

```bash
npm run release:patch
```

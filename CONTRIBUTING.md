# Contributing to Grimoire

Thanks for helping! Bug reports, ideas and pull requests are all welcome.

## Reporting a bug or asking for a feature

Open an [issue](https://github.com/SecreSwalowtail/Grimoire/issues/new/choose) and pick a template.
For bugs, say what you did, what you expected and what happened instead, plus your phone and the
app version (Settings → About). A screenshot or screen recording helps a lot.

## Setting up

You need [Node.js](https://nodejs.org) (the current LTS version), and Android Studio for Android or
Xcode on a Mac for iOS.

```bash
git clone https://github.com/SecreSwalowtail/Grimoire.git
cd Grimoire
npm install
npx expo run:android   # or: npx expo run:ios
```

The app uses native modules (camera, text recognition, Skia), so it needs a development build: it
doesn't run in Expo Go. After the first build, `npx expo start` is enough for JavaScript changes.

## Where things are

| Folder | What's in it |
| --- | --- |
| `src/app/` | Screens. Every file is a route ([Expo Router](https://docs.expo.dev/router/introduction/)); `_layout.tsx` files are navigators. |
| `src/components/` | Pieces of screens, grouped by screen (`binder/`, `deck/`, `card/`, …). |
| `src/db/` | The SQLite database on the phone, and Scryfall lookups. |
| `src/rules/` | Magic rules: formats, legality, deck checks, keywords. |
| `src/utils/` | Settings, money and currencies, prices, small helpers. |
| `src/constants/` | Colors, fonts, URLs. |

## Making a change

1. Fork the repo and create a branch from `main`.
2. Keep the change focused on one thing.
3. Match the code around it: naming, comments, and the dark and gold look of the app.
   Install new packages with `npx expo install <package>`, so the version fits the Expo SDK.
4. Before opening the pull request, run both checks and make sure they pass:

   ```bash
   npx tsc --noEmit
   npx expo lint
   ```

5. Try your change on a real phone or an emulator, and add screenshots to the pull request when
   something on screen changed.

## A few rules

- Never edit the `android/` or `ios/` folders by hand: they're generated. Native settings go in
  `app.json` or a config plugin.
- Don't add Wizards of the Coast logos or other trademarks to the app or the repo.
- Be kind in issues and reviews.

## License

Grimoire is under the [PolyForm Noncommercial License 1.0.0](LICENSE). By contributing, you agree
that your contribution is shared under the same license.

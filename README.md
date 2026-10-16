# Grimoire

**A Magic: The Gathering collection app for Android and iOS.** Scan your cards with the camera,
keep them in binders, see what they're worth, search every card ever printed, and build decks
from what you own.

## Features

- **Scan cards**: point the camera at a card and it's recognized from its set code and
  collector number, then added to your binder. Single mode, or Bulk mode for a whole stack.
- **Binders**: your collection as 9-pocket binder pages, with value, weekly change and card
  count. Search, sort and group the cards, look at one up close (it tilts with your phone and
  foils shine), and hold cards to select and drag them: to another binder, into a deck, or into
  the trash.
- **Market**: search every Magic card through Scryfall by name, rules text or type, with filters
  for format legality, colors, mana cost, set, rarity and language.
- **Card detail**: the card, its prices (Cardmarket and TCGplayer) with price history, every
  printing and your copies of each, rules, rulings and format legality.
- **Decks**: decks and folders, a commander slot with partner rules, main deck, sideboard and
  maybe list, stats (curve, colors, types) and a legality check per format. Add cards straight
  from the deck's search (it searches every card when the deck has none), change copies with
  − / +, and drag cards between parts of the deck.

## Built with

- [Expo](https://expo.dev) (SDK 57) and [React Native](https://reactnative.dev), in TypeScript
- [Expo Router](https://docs.expo.dev/router/introduction/) for navigation
- [Reanimated](https://docs.swmansion.com/react-native-reanimated/) and
  [Gesture Handler](https://docs.swmansion.com/react-native-gesture-handler/) for animation and
  drag and drop
- [Skia](https://shopify.github.io/react-native-skia/) for card effects
- [VisionCamera](https://react-native-vision-camera.com) and
  [ML Kit text recognition](https://developers.google.com/ml-kit/vision/text-recognition) for scanning
- [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) for the collection, stored on the phone
- Card data and images from [Scryfall](https://scryfall.com)

## Run it

```bash
npm install
npx expo run:android   # or: npx expo run:ios (needs a Mac)
```

## License

[PolyForm Noncommercial 1.0.0](LICENSE): you may read, learn from, copy and change this code for
any noncommercial purpose. Commercial use isn't allowed. This makes the project source-available
rather than open source.

## Legal

Grimoire is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed
by Wizards. Portions of the materials used are property of Wizards of the Coast.
©Wizards of the Coast LLC.

Card data and images: [Scryfall](https://scryfall.com). Prices: [MTGJSON](https://mtgjson.com),
from Cardmarket and TCGplayer. Grimoire is not affiliated with any of them.

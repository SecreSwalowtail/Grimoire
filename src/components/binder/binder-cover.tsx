import { StyleSheet, View } from 'react-native';

import { binderCover, binderShades, binderSpine } from '@/db/binders';

// The binder is drawn at the design's size and scaled to the column width.
export const COVER_BOX = { width: 168, height: 182 }
const W = 114
const H = 164
// Turned, the binder reaches from 62 left of the cover's center (spine) to 50 right of it (front
// edge). The cover's center at 62 puts the spine on the box's left edge, in line with the text below.
const LEFT = 62 - 114 / 2
const TOP = 6
const SPINE = 24
const PERSPECTIVE = 720
const TURN = '26deg'

// A closed binder standing at an angle: the front cover turned 26° away, so its darker spine shows
// on the left. Plain leather in the binder's color, with stitching and a zipper; nothing on it.
//
// RN has no preserve-3d, so the spine isn't a child of the turned cover: it gets the same turn
// and perspective around the cover's center, then folds back 90° at the cover's left edge.
export function BinderCover({ color, scale }: { color: string; scale: number }) {
  // From the spine's center (on the cover's left edge) to the cover's center.
  const toCenter = W / 2
  return (
    <View style={{ width: COVER_BOX.width * scale, height: COVER_BOX.height * scale }}>
      <View style={[styles.box, { transform: [{ scale }] }]}>
        <View style={styles.ground} />

        <View
          style={[
            styles.spine,
            { experimental_backgroundImage: binderSpine(color) },
            {
              transform: [
                { translateX: toCenter },
                { perspective: PERSPECTIVE },
                { rotateY: TURN },
                { translateX: -toCenter },
                { rotateY: '-90deg' },
                { translateX: -SPINE / 2 },
              ],
            },
          ]}
        />

        <View
          style={[
            styles.cover,
            { borderColor: binderShades(color).zip, experimental_backgroundImage: binderCover(color) },
            { transform: [{ perspective: PERSPECTIVE }, { rotateY: TURN }] },
          ]}
        >
          <View style={styles.stitches} />
          <View style={styles.zipPull} />
          <View style={styles.sheen} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  box: {
    width: COVER_BOX.width,
    height: COVER_BOX.height,
    transformOrigin: 'top left',
  },
  // Soft shadow on the ground under the binder.
  ground: {
    position: 'absolute',
    left: 0,
    width: 124,
    bottom: 2,
    height: 16,
    experimental_backgroundImage: 'radial-gradient(closest-side, rgba(0,0,0,0.6), rgba(0,0,0,0))',
  },
  spine: {
    position: 'absolute',
    left: LEFT - SPINE / 2,
    top: TOP,
    width: SPINE,
    height: H,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,240,215,0.10)',
  },
  cover: {
    position: 'absolute',
    left: LEFT,
    top: TOP,
    width: W,
    height: H,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderWidth: 2.5,
    overflow: 'hidden',
    boxShadow: '18px 20px 30px rgba(0,0,0,0.45)',
  },
  // Stitching around the front, just inside the zipper.
  stitches: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: 5,
    bottom: 5,
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
    borderTopRightRadius: 13,
    borderBottomRightRadius: 13,
    borderWidth: 1.25,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,240,215,0.26)',
  },
  zipPull: {
    position: 'absolute',
    right: -2,
    bottom: 26,
    width: 7,
    height: 22,
    borderRadius: 3,
    experimental_backgroundImage: 'linear-gradient(90deg, #8C7546, #F6E7BC 50%, #8C7546)',
  },
  sheen: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage:
      'linear-gradient(105deg, rgba(255,245,225,0.10) 0%, rgba(255,245,225,0) 38%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.22) 100%)',
  },
})

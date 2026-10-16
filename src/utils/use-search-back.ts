import { useEffect, type RefObject } from 'react'
import { Keyboard, Platform, type TextInput } from 'react-native'

// Back while typing a search closes the keyboard and leaves the search box (the text stays).
// Android's back button closes the keyboard by itself but keeps the box focused, so the next tap
// on it wouldn't bring the keyboard back; this takes the focus off too. Closed any other way
// (scrolling, running the search), the box has lost its focus already.
export function useSearchBack(input: RefObject<TextInput | null>) {
  useEffect(() => {
    if (Platform.OS !== 'android') return
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      if (input.current?.isFocused()) input.current.blur()
    })
    return () => sub.remove()
  }, [input])
}

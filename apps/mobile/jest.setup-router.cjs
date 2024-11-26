/* global jest */
// Component tests render screens without a navigation container. Screens that use
// useFocusEffect (for example the shared header's hardware Back handler) treat the test as a
// focused screen. A test file's own jest.mock('expo-router', …) still takes precedence.
jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  const { useEffect } = jest.requireActual('react');
  return { ...actual, useFocusEffect: (work) => useEffect(work, [work]) };
});

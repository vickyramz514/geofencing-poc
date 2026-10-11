jest.mock('react-native-maps', () => {
  const React = require('react');
  const {View} = require('react-native');
  const MockMap = props => React.createElement(View, props, props.children);
  return {
    __esModule: true,
    default: MockMap,
    Marker: MockMap,
    Circle: MockMap,
    Callout: MockMap,
    PROVIDER_GOOGLE: 'google',
    PROVIDER_DEFAULT: undefined,
  };
});

jest.mock('@react-native-community/geolocation', () => ({
  __esModule: true,
  default: {
    setRNConfiguration: jest.fn(),
    requestAuthorization: jest.fn(success => success && success()),
    watchPosition: jest.fn(() => 1),
    clearWatch: jest.fn(),
    getCurrentPosition: jest.fn(),
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn(() =>
      Promise.resolve({isConnected: true, isInternetReachable: true}),
    ),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(() => Promise.resolve(false)),
  setGenericPassword: jest.fn(() => Promise.resolve(true)),
  resetGenericPassword: jest.fn(() => Promise.resolve(true)),
}));

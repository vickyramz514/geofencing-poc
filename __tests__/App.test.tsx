/**
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('renders the geofencing dashboard', async () => {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<App />);
  });
});

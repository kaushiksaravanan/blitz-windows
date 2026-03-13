import { AppRegistry } from 'react-native'

import App from './App'

const rootTag = document.getElementById('root')

AppRegistry.registerComponent('App', () => App)
AppRegistry.runApplication('App', { rootTag })

if (import.meta.hot) {
  import.meta.hot.accept('./App', (mod) => {
    const NextApp = mod?.default ?? App
    AppRegistry.registerComponent('App', () => NextApp)
    AppRegistry.runApplication('App', { rootTag })
  })
}


import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { pinia } from './stores/pinia';
import '@fortawesome/fontawesome-free/css/all.min.css';
import 'tippy.js/dist/tippy.css';
import './styles.css';

createApp(App).use(pinia).use(router).mount('#app');

import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import Extract from './pages/extract/Extract.vue';
import Upload from './pages/upload/Upload.vue';
import './style.css';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: Upload, name: 'Upload' },
    { path: "/extract/:id", component: Extract, name: 'Extract' },
  ],
})

const app = createApp(App);
app.use(router)
app.use(createPinia())
app.mount('#app')

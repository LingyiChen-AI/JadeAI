import { app, BrowserWindow } from 'electron';

app.setName('JadeAI');

app.whenReady().then(() => {
  const window = new BrowserWindow({ width: 1280, height: 860 });
  void window.loadURL('data:text/html,<h1>JadeAI shell alive</h1>');
});

app.on('window-all-closed', () => {
  app.quit();
});

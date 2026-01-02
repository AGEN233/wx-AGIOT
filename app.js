// app.js
import bleService from './utils/bleService.js';
App({
  onLaunch() {
    console.log('App Launching...');
        bleService.setGlobalDataCallback((parsed) => {
            console.log('====== [App全局监控] ======');
            console.log('CMD:', parsed.cmd.toString(16));
            console.log('Data:', parsed.data);
            console.log('==========================');

            // 你可以在这里做全局逻辑，例如：
            // 1. 写入本地日志文件
            // 2. 检测到设备报警 CMD，弹窗提示
            // 3. 更新全局状态 Store
        });
        
    wx.login({
      success: res => {
      }
    })
  },
  globalData: {
    userInfo: null
  }
})

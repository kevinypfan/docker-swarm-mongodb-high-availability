const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const MongoDBMonitor = require('./monitor');
const { TestRecord, SystemStatus, ErrorLog } = require('./models');

class WebServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    this.monitor = new MongoDBMonitor();
    this.clients = new Set();
    this.port = config.webServer.port;
    this.host = config.webServer.host;
    this.isRunning = false;
    this.latestStatus = null;
    this.stats = {
      totalWrites: 0,
      totalErrors: 0,
      lastWriteTime: null,
      startTime: Date.now()
    };
  }

  // 初始化 Web 服務器
  async initialize() {
    try {
      console.log('🌐 初始化 Web 服務器...');
      
      // 設定中間件
      this.setupMiddleware();
      
      // 設定路由
      this.setupRoutes();
      
      // 設定 WebSocket
      this.setupWebSocket();
      
      // 嘗試初始化監控器
      try {
        await this.monitor.initialize();
        console.log('✅ MongoDB 監控器連接成功');
      } catch (monitorError) {
        console.warn('⚠️ MongoDB 監控器連接失敗，Web 服務器將以受限模式運行:', monitorError.message);
        this.monitor.isConnected = false;
      }
      
      console.log('✅ Web 服務器初始化成功');
      return true;
    } catch (error) {
      console.error('❌ Web 服務器初始化失敗:', error.message);
      return false;
    }
  }

  // 設定中間件
  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'public')));
  }

  // 設定路由
  setupRoutes() {
    // 首頁
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // API 路由
    this.app.get('/api/status', this.getStatus.bind(this));
    this.app.get('/api/stats', this.getStats.bind(this));
    this.app.get('/api/records', this.getRecords.bind(this));
    this.app.get('/api/errors', this.getErrors.bind(this));
    this.app.get('/api/config', this.getConfig.bind(this));
    this.app.post('/api/test', this.runTest.bind(this));
  }

  // 設定 WebSocket
  setupWebSocket() {
    this.wss.on('connection', (ws) => {
      console.log('📱 新的 WebSocket 連線');
      this.clients.add(ws);

      // 發送當前狀態
      if (this.latestStatus) {
        ws.send(JSON.stringify({
          type: 'status',
          data: this.latestStatus
        }));
      }

      ws.on('close', () => {
        console.log('📱 WebSocket 連線關閉');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('❌ WebSocket 錯誤:', error.message);
        this.clients.delete(ws);
      });
    });
  }

  // 廣播訊息給所有客戶端
  broadcast(message) {
    const data = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(data);
        } catch (error) {
          console.error('❌ 廣播失敗:', error.message);
          this.clients.delete(client);
        }
      }
    });
  }

  // API: 獲取當前狀態
  async getStatus(req, res) {
    try {
      // 檢查監控器連接狀態
      if (!this.monitor.isConnected) {
        res.status(503).json({
          success: false,
          error: 'MongoDB 連接未建立'
        });
        return;
      }

      const status = await this.monitor.recordSystemStatus();
      if (status) {
        this.latestStatus = status;
        res.json({
          success: true,
          data: status
        });
      } else {
        res.status(500).json({
          success: false,
          error: '無法獲取系統狀態'
        });
      }
    } catch (error) {
      console.error('獲取狀態失敗:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // API: 獲取統計資訊
  async getStats(req, res) {
    try {
      // 檢查監控器連接狀態
      if (!this.monitor.isConnected) {
        res.status(503).json({
          success: false,
          error: 'MongoDB 連接未建立'
        });
        return;
      }

      const now = Date.now();
      const runtime = now - this.stats.startTime;
      
      // 獲取最近的記錄統計
      const totalRecords = await TestRecord.countDocuments();
      const recentRecords = await TestRecord.countDocuments({
        createdAt: { $gte: new Date(now - 3600000) } // 最近1小時
      });
      
      // 獲取錯誤統計
      const totalErrors = await ErrorLog.countDocuments();
      const recentErrors = await ErrorLog.countDocuments({
        timestamp: { $gte: new Date(now - 3600000) }
      });

      // 計算吞吐量
      const throughput = runtime > 0 ? Math.round((totalRecords * 1000) / runtime) : 0;

      res.json({
        success: true,
        data: {
          runtime: Math.round(runtime / 1000), // 秒
          totalRecords,
          recentRecords,
          totalErrors,
          recentErrors,
          throughput,
          lastUpdate: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('獲取統計失敗:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // API: 獲取最近記錄
  async getRecords(req, res) {
    try {
      // 檢查監控器連接狀態
      if (!this.monitor.isConnected) {
        res.status(503).json({
          success: false,
          error: 'MongoDB 連接未建立'
        });
        return;
      }

      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      
      const records = await TestRecord
        .find()
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .select('sequenceId timestamp data writtenTo batchId status createdAt');

      const total = await TestRecord.countDocuments();

      res.json({
        success: true,
        data: {
          records,
          total,
          limit,
          offset
        }
      });
    } catch (error) {
      console.error('獲取記錄失敗:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // API: 獲取錯誤日誌
  async getErrors(req, res) {
    try {
      // 檢查監控器連接狀態
      if (!this.monitor.isConnected) {
        res.status(503).json({
          success: false,
          error: 'MongoDB 連接未建立'
        });
        return;
      }

      const limit = parseInt(req.query.limit) || 20;
      const type = req.query.type;
      
      const query = type ? { type } : {};
      const errors = await ErrorLog
        .find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .select('timestamp type message details resolved');

      res.json({
        success: true,
        data: errors
      });
    } catch (error) {
      console.error('獲取錯誤日誌失敗:', error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // API: 獲取配置資訊
  getConfig(req, res) {
    // 隱藏敏感資訊
    const safeConfig = {
      mongodb: {
        uri: config.mongodb.uri.replace(/\/\/.*@/, '//***:***@'),
        options: {
          maxPoolSize: config.mongodb.options.maxPoolSize,
          serverSelectionTimeoutMS: config.mongodb.options.serverSelectionTimeoutMS,
          readPreference: config.mongodb.options.readPreference
        }
      },
      testing: config.testing,
      logging: config.logging
    };

    res.json({
      success: true,
      data: safeConfig
    });
  }

  // API: 執行測試
  async runTest(req, res) {
    try {
      const { type = 'validation' } = req.body;
      
      let result;
      switch (type) {
        case 'validation':
          const DataIntegrityValidator = require('./validator');
          const validator = new DataIntegrityValidator();
          await validator.initialize();
          result = await validator.performFullValidation();
          await validator.cleanup();
          break;
          
        case 'status':
          result = await this.monitor.recordSystemStatus();
          break;
          
        default:
          throw new Error(`未知的測試類型: ${type}`);
      }

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // 啟動 Web 服務器
  async start() {
    if (this.isRunning) {
      console.log('⚠️ Web 服務器已在運行中');
      return;
    }

    try {
      await new Promise((resolve, reject) => {
        this.server.listen(this.port, this.host, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      this.isRunning = true;
      console.log(`🌐 Web 服務器已啟動: http://${this.host}:${this.port}`);
      
      // 啟動定期狀態更新
      this.startStatusUpdates();
      
    } catch (error) {
      console.error('❌ Web 服務器啟動失敗:', error.message);
      throw error;
    }
  }

  // 開始定期狀態更新
  startStatusUpdates() {
    setInterval(async () => {
      try {
        // 檢查連接狀態，如果斷開則嘗試重新連接
        if (!this.monitor.isConnected) {
          console.log('⚠️ 檢測到 MongoDB 連接斷開，嘗試重新連接...');
          try {
            await this.monitor.connect();
            console.log('✅ MongoDB 重新連接成功');
          } catch (reconnectError) {
            console.error('❌ MongoDB 重新連接失敗:', reconnectError.message);
            return;
          }
        }

        // 只有在監控器連接時才更新狀態
        if (this.monitor.isConnected) {
          const status = await this.monitor.recordSystemStatus();
          if (status) {
            this.latestStatus = status;
            this.broadcast({
              type: 'status',
              data: status
            });
          }
        }
      } catch (error) {
        console.error('❌ 狀態更新失敗:', error.message);
        // 如果錯誤是連接問題，標記為斷開
        if (error.message.includes('Client must be connected')) {
          this.monitor.isConnected = false;
        }
      }
    }, config.testing.monitorInterval);

    // 統計更新
    setInterval(async () => {
      try {
        // 只有在監控器連接時才更新統計
        if (this.monitor.isConnected) {
          const totalRecords = await TestRecord.countDocuments();
          const totalErrors = await ErrorLog.countDocuments();
          
          this.broadcast({
            type: 'stats',
            data: {
              totalRecords,
              totalErrors,
              timestamp: new Date().toISOString()
            }
          });
        }
      } catch (error) {
        console.error('❌ 統計更新失敗:', error.message);
      }
    }, 5000); // 每5秒更新統計
  }

  // 停止 Web 服務器
  async stop() {
    if (!this.isRunning) {
      console.log('⚠️ Web 服務器未在運行');
      return;
    }

    try {
      // 關閉所有 WebSocket 連線
      this.clients.forEach(client => {
        client.close();
      });
      this.clients.clear();

      // 關閉 HTTP 服務器
      await new Promise((resolve) => {
        this.server.close(resolve);
      });

      // 停止監控器
      await this.monitor.stop();

      this.isRunning = false;
      console.log('🛑 Web 服務器已停止');
      
    } catch (error) {
      console.error('❌ Web 服務器停止失敗:', error.message);
    }
  }
}

module.exports = WebServer;

// 如果直接執行此檔案，啟動 Web 服務器
if (require.main === module) {
  const webServer = new WebServer();
  
  webServer.initialize().then(success => {
    if (success) {
      webServer.start();
    } else {
      process.exit(1);
    }
  });

  // 優雅關閉
  process.on('SIGINT', async () => {
    console.log('\n🛑 接收到停止信號，正在關閉 Web 服務器...');
    await webServer.stop();
    process.exit(0);
  });
}
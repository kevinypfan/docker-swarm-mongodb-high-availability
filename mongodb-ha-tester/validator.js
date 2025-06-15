const mongoose = require('mongoose');
const colors = require('colors');
const moment = require('moment');
const config = require('./config');
const { TestRecord, SystemStatus, ErrorLog } = require('./models');

class DataIntegrityValidator {
  constructor() {
    this.isRunning = false;
    this.validationCount = 0;
    this.lastValidation = null;
    this.integrityIssues = [];
  }

  // 初始化驗證器
  async initialize() {
    try {
      console.log(colors.blue('🔍 初始化資料完整性驗證器...'));
      
      // 連接到 MongoDB
      await this.connect();
      
      console.log(colors.green('✅ 資料完整性驗證器初始化成功'));
      return true;
    } catch (error) {
      console.error(colors.red('❌ 資料完整性驗證器初始化失敗:'), error.message);
      await this.logError('system', '驗證器初始化失敗', error);
      return false;
    }
  }

  // 連接到 MongoDB
  async connect() {
    try {
      if (mongoose.connection.readyState === 0) {
        console.log(colors.yellow('🔗 正在連接到 MongoDB...'));
        await mongoose.connect(config.mongodb.uri, config.mongodb.options);
      }
      
      console.log(colors.green('✅ MongoDB 連接成功'));
      return true;
    } catch (error) {
      console.error(colors.red('❌ MongoDB 連接失敗:'), error.message);
      await this.logError('connection', 'MongoDB 連接失敗', error);
      throw error;
    }
  }

  // 驗證序列完整性
  async validateSequenceIntegrity(batchId = null) {
    try {
      console.log(colors.yellow('🔍 正在驗證序列完整性...'));
      
      const query = batchId ? { batchId } : {};
      
      // 獲取所有測試記錄並按序列 ID 排序
      const records = await TestRecord.find(query)
        .sort({ sequenceId: 1 })
        .select('sequenceId timestamp batchId writtenTo')
        .lean();
      
      if (records.length === 0) {
        console.log(colors.yellow('⚠️ 沒有找到測試記錄'));
        return {
          totalRecords: 0,
          missingSequences: [],
          duplicateSequences: [],
          isValid: true,
          gaps: [],
          summary: '沒有資料需要驗證'
        };
      }
      
      const totalRecords = records.length;
      const minSequenceId = records[0].sequenceId;
      const maxSequenceId = records[records.length - 1].sequenceId;
      
      // 檢查缺失的序列
      const missingSequences = [];
      const duplicateSequences = [];
      const gaps = [];
      
      // 建立序列 ID 計數器
      const sequenceCount = {};
      records.forEach(record => {
        sequenceCount[record.sequenceId] = (sequenceCount[record.sequenceId] || 0) + 1;
      });
      
      // 檢查連續性和重複
      for (let i = minSequenceId; i <= maxSequenceId; i++) {
        const count = sequenceCount[i] || 0;
        
        if (count === 0) {
          missingSequences.push(i);
        } else if (count > 1) {
          duplicateSequences.push({ sequenceId: i, count });
        }
      }
      
      // 尋找間隙
      let gapStart = null;
      for (let i = minSequenceId; i <= maxSequenceId; i++) {
        if (!sequenceCount[i]) {
          if (gapStart === null) {
            gapStart = i;
          }
        } else {
          if (gapStart !== null) {
            gaps.push({ start: gapStart, end: i - 1, size: i - gapStart });
            gapStart = null;
          }
        }
      }
      
      // 處理最後一個間隙
      if (gapStart !== null) {
        gaps.push({ start: gapStart, end: maxSequenceId, size: maxSequenceId - gapStart + 1 });
      }
      
      const isValid = missingSequences.length === 0 && duplicateSequences.length === 0;
      
      const result = {
        totalRecords,
        expectedRecords: maxSequenceId - minSequenceId + 1,
        minSequenceId,
        maxSequenceId,
        missingSequences,
        duplicateSequences,
        gaps,
        isValid,
        completeness: totalRecords / (maxSequenceId - minSequenceId + 1) * 100,
        summary: this.generateSummary(totalRecords, missingSequences.length, duplicateSequences.length, gaps.length)
      };
      
      console.log(colors.green('✅ 序列完整性驗證完成'));
      return result;
      
    } catch (error) {
      console.error(colors.red('❌ 驗證序列完整性失敗:'), error.message);
      await this.logError('validation', '驗證序列完整性失敗', error);
      return null;
    }
  }

  // 驗證時間戳一致性
  async validateTimestampConsistency(batchId = null) {
    try {
      console.log(colors.yellow('🕐 正在驗證時間戳一致性...'));
      
      const query = batchId ? { batchId } : {};
      
      // 獲取記錄並按序列 ID 排序
      const records = await TestRecord.find(query)
        .sort({ sequenceId: 1 })
        .select('sequenceId timestamp createdAt')
        .lean();
      
      if (records.length < 2) {
        return {
          isValid: true,
          outOfOrderCount: 0,
          timeReversals: [],
          summary: '記錄數量不足，無法驗證時間一致性'
        };
      }
      
      const timeReversals = [];
      let outOfOrderCount = 0;
      
      for (let i = 1; i < records.length; i++) {
        const current = records[i];
        const previous = records[i - 1];
        
        // 檢查時間戳是否反轉（較新的序列 ID 有較舊的時間戳）
        if (current.timestamp < previous.timestamp) {
          timeReversals.push({
            sequenceId: current.sequenceId,
            previousSequenceId: previous.sequenceId,
            currentTime: current.timestamp,
            previousTime: previous.timestamp,
            timeDiff: previous.timestamp - current.timestamp
          });
          outOfOrderCount++;
        }
      }
      
      const isValid = outOfOrderCount === 0;
      
      return {
        isValid,
        outOfOrderCount,
        timeReversals,
        totalRecords: records.length,
        summary: `發現 ${outOfOrderCount} 個時間戳不一致的記錄`
      };
      
    } catch (error) {
      console.error(colors.red('❌ 驗證時間戳一致性失敗:'), error.message);
      await this.logError('validation', '驗證時間戳一致性失敗', error);
      return null;
    }
  }

  // 驗證跨節點資料一致性
  async validateCrossNodeConsistency() {
    try {
      console.log(colors.yellow('🔄 正在驗證跨節點資料一致性...'));
      
      // 使用不同的讀取偏好設定來檢查一致性
      const readPreferences = ['primary', 'secondary', 'secondaryPreferred'];
      const results = {};
      
      for (const preference of readPreferences) {
        try {
          // 設定讀取偏好
          const session = await mongoose.startSession();
          session.startTransaction({
            readPreference: preference,
            readConcern: { level: 'majority' }
          });
          
          const count = await TestRecord.countDocuments({}, { session });
          const latestRecord = await TestRecord.findOne({}, { session })
            .sort({ sequenceId: -1 })
            .select('sequenceId timestamp');
          
          await session.commitTransaction();
          session.endSession();
          
          results[preference] = {
            count,
            latestSequenceId: latestRecord ? latestRecord.sequenceId : 0,
            latestTimestamp: latestRecord ? latestRecord.timestamp : null
          };
          
        } catch (error) {
          console.error(colors.red(`❌ 從 ${preference} 讀取失敗:`), error.message);
          results[preference] = { error: error.message };
        }
      }
      
      // 檢查一致性
      const counts = Object.values(results)
        .filter(r => !r.error)
        .map(r => r.count);
      
      const latestSequenceIds = Object.values(results)
        .filter(r => !r.error)
        .map(r => r.latestSequenceId);
      
      const isCountConsistent = counts.length > 0 && counts.every(c => c === counts[0]);
      const isSequenceConsistent = latestSequenceIds.length > 0 && 
        latestSequenceIds.every(s => s === latestSequenceIds[0]);
      
      return {
        isValid: isCountConsistent && isSequenceConsistent,
        results,
        isCountConsistent,
        isSequenceConsistent,
        summary: `跨節點資料一致性: ${isCountConsistent && isSequenceConsistent ? '正常' : '異常'}`
      };
      
    } catch (error) {
      console.error(colors.red('❌ 驗證跨節點資料一致性失敗:'), error.message);
      await this.logError('validation', '驗證跨節點資料一致性失敗', error);
      return null;
    }
  }

  // 執行完整的資料完整性檢查
  async performFullValidation(batchId = null) {
    try {
      console.log(colors.blue('🔍 開始完整資料完整性檢查...'));
      const startTime = Date.now();
      
      // 執行各項驗證
      const [sequenceValidation, timestampValidation, crossNodeValidation] = await Promise.all([
        this.validateSequenceIntegrity(batchId),
        this.validateTimestampConsistency(batchId),
        this.validateCrossNodeConsistency()
      ]);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      const overallValid = sequenceValidation?.isValid && 
                          timestampValidation?.isValid && 
                          crossNodeValidation?.isValid;
      
      const validationResult = {
        timestamp: new Date(),
        batchId,
        duration,
        overallValid,
        sequenceValidation,
        timestampValidation,
        crossNodeValidation,
        summary: this.generateOverallSummary(sequenceValidation, timestampValidation, crossNodeValidation)
      };
      
      // 保存驗證結果到系統狀態
      await this.saveValidationResult(validationResult);
      
      // 顯示結果
      this.displayValidationResult(validationResult);
      
      this.validationCount++;
      this.lastValidation = new Date();
      
      return validationResult;
      
    } catch (error) {
      console.error(colors.red('❌ 完整資料完整性檢查失敗:'), error.message);
      await this.logError('validation', '完整資料完整性檢查失敗', error);
      return null;
    }
  }

  // 保存驗證結果
  async saveValidationResult(validationResult) {
    try {
      const systemStatus = new SystemStatus({
        checkTime: validationResult.timestamp,
        replicaSetStatus: {}, // 這裡可以從監控器獲取
        connectionStatus: {
          isConnected: mongoose.connection.readyState === 1,
          lastUpdate: new Date()
        },
        dataIntegrity: {
          totalRecords: validationResult.sequenceValidation?.totalRecords || 0,
          missingSequences: validationResult.sequenceValidation?.missingSequences || [],
          duplicateSequences: validationResult.sequenceValidation?.duplicateSequences || [],
          isValid: validationResult.overallValid
        }
      });
      
      await systemStatus.save();
    } catch (error) {
      console.error(colors.red('❌ 保存驗證結果失敗:'), error.message);
    }
  }

  // 顯示驗證結果
  displayValidationResult(result) {
    console.log(colors.cyan('\n📋 資料完整性驗證報告'));
    console.log(colors.cyan('═'.repeat(60)));
    
    console.log(colors.white(`驗證時間: ${moment(result.timestamp).format('YYYY-MM-DD HH:mm:ss')}`));
    console.log(colors.white(`耗時: ${result.duration}ms`));
    console.log(colors.white(`批次 ID: ${result.batchId || '全部資料'}`));
    
    const overallColor = result.overallValid ? colors.green : colors.red;
    console.log(colors.white(`整體狀態: ${overallColor(result.overallValid ? '✅ 正常' : '❌ 異常')}`));
    
    // 序列完整性
    if (result.sequenceValidation) {
      const sv = result.sequenceValidation;
      console.log(colors.yellow('\n🔢 序列完整性:'));
      console.log(colors.white(`  總記錄數: ${sv.totalRecords}`));
      console.log(colors.white(`  預期記錄數: ${sv.expectedRecords || 'N/A'}`));
      console.log(colors.white(`  完整度: ${sv.completeness ? sv.completeness.toFixed(2) + '%' : 'N/A'}`));
      console.log(colors.white(`  缺失序列: ${sv.missingSequences?.length || 0} 個`));
      console.log(colors.white(`  重複序列: ${sv.duplicateSequences?.length || 0} 個`));
      console.log(colors.white(`  間隙數量: ${sv.gaps?.length || 0} 個`));
      
      if (sv.gaps && sv.gaps.length > 0) {
        console.log(colors.red('  主要間隙:'));
        sv.gaps.slice(0, 5).forEach(gap => {
          console.log(colors.red(`    ${gap.start}-${gap.end} (大小: ${gap.size})`));
        });
      }
    }
    
    // 時間戳一致性
    if (result.timestampValidation) {
      const tv = result.timestampValidation;
      console.log(colors.yellow('\n🕐 時間戳一致性:'));
      console.log(colors.white(`  總記錄數: ${tv.totalRecords || 0}`));
      console.log(colors.white(`  時間不一致: ${tv.outOfOrderCount || 0} 個`));
      
      if (tv.timeReversals && tv.timeReversals.length > 0) {
        console.log(colors.red('  主要時間反轉:'));
        tv.timeReversals.slice(0, 3).forEach(reversal => {
          console.log(colors.red(`    序列 ${reversal.sequenceId}: 比序列 ${reversal.previousSequenceId} 早 ${reversal.timeDiff}ms`));
        });
      }
    }
    
    // 跨節點一致性
    if (result.crossNodeValidation) {
      const cv = result.crossNodeValidation;
      console.log(colors.yellow('\n🔄 跨節點一致性:'));
      console.log(colors.white(`  計數一致性: ${cv.isCountConsistent ? colors.green('✅') : colors.red('❌')}`));
      console.log(colors.white(`  序列一致性: ${cv.isSequenceConsistent ? colors.green('✅') : colors.red('❌')}`));
      
      if (cv.results) {
        Object.entries(cv.results).forEach(([preference, data]) => {
          if (data.error) {
            console.log(colors.red(`  ${preference}: 錯誤 - ${data.error}`));
          } else {
            console.log(colors.white(`  ${preference}: ${data.count} 記錄, 最新序列: ${data.latestSequenceId}`));
          }
        });
      }
    }
    
    console.log(colors.cyan('═'.repeat(60)));
    console.log(colors.white(`總結: ${result.summary}`));
  }

  // 生成摘要
  generateSummary(totalRecords, missingCount, duplicateCount, gapCount) {
    if (totalRecords === 0) return '沒有資料';
    if (missingCount === 0 && duplicateCount === 0) return '資料完整性良好';
    
    const issues = [];
    if (missingCount > 0) issues.push(`${missingCount} 個缺失序列`);
    if (duplicateCount > 0) issues.push(`${duplicateCount} 個重複序列`);
    if (gapCount > 0) issues.push(`${gapCount} 個間隙`);
    
    return `發現問題: ${issues.join(', ')}`;
  }

  // 生成整體摘要
  generateOverallSummary(sequence, timestamp, crossNode) {
    const issues = [];
    
    if (sequence && !sequence.isValid) {
      issues.push('序列完整性問題');
    }
    
    if (timestamp && !timestamp.isValid) {
      issues.push('時間戳一致性問題');
    }
    
    if (crossNode && !crossNode.isValid) {
      issues.push('跨節點一致性問題');
    }
    
    return issues.length === 0 ? '所有驗證項目均正常' : `發現問題: ${issues.join(', ')}`;
  }

  // 開始持續驗證
  async startContinuousValidation() {
    if (this.isRunning) {
      console.log(colors.yellow('⚠️ 驗證器已在運行中'));
      return;
    }
    
    this.isRunning = true;
    console.log(colors.blue(`🔍 開始持續驗證 (間隔: ${config.testing.verifyInterval}ms)`));
    
    const validationLoop = async () => {
      if (!this.isRunning) return;
      
      try {
        await this.performFullValidation();
      } catch (error) {
        console.error(colors.red('❌ 驗證循環錯誤:'), error.message);
        await this.logError('validation', '驗證循環錯誤', error);
      }
      
      // 設定下次驗證
      if (this.isRunning) {
        setTimeout(validationLoop, config.testing.verifyInterval);
      }
    };
    
    // 開始驗證循環
    validationLoop();
  }

  // 停止驗證
  stopValidation() {
    this.isRunning = false;
    console.log(colors.yellow('🛑 驗證器已停止'));
  }

  // 記錄錯誤
  async logError(type, message, error) {
    try {
      const errorLog = new ErrorLog({
        type,
        message,
        details: {
          validationCount: this.validationCount,
          stack: error?.stack,
          code: error?.code,
          name: error?.name
        },
        stack: error?.stack
      });
      
      await errorLog.save();
    } catch (logError) {
      console.error(colors.red('❌ 記錄錯誤失敗:'), logError.message);
    }
  }

  // 清理並關閉
  async cleanup() {
    this.stopValidation();
    
    try {
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        console.log(colors.yellow('🔌 MongoDB 連接已關閉'));
      }
    } catch (error) {
      console.error(colors.red('❌ 關閉連接失敗:'), error.message);
    }
  }
}

module.exports = DataIntegrityValidator;

// 如果直接執行此檔案，啟動驗證器
if (require.main === module) {
  const validator = new DataIntegrityValidator();
  
  validator.initialize().then(success => {
    if (success) {
      const mode = process.argv[2] || 'once';
      const batchId = process.argv[3] || null;
      
      if (mode === 'continuous') {
        validator.startContinuousValidation();
      } else {
        validator.performFullValidation(batchId).then(() => {
          validator.cleanup();
        });
      }
    } else {
      process.exit(1);
    }
  });

  // 優雅關閉
  process.on('SIGINT', async () => {
    console.log(colors.yellow('\n🛑 接收到停止信號，正在關閉驗證器...'));
    await validator.cleanup();
    process.exit(0);
  });
}
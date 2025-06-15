#!/usr/bin/env node

const colors = require('colors');
const moment = require('moment');
const mongoose = require('mongoose');

const config = require('./config');
const { TestRecord, ErrorLog, Counter } = require('./models');
const MongoDBMonitor = require('./monitor');
const SequentialWriter = require('./writer');
const DataIntegrityValidator = require('./validator');

class TestSuite {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.testResults = [];
  }

  // 執行測試並記錄結果
  async runTest(testName, testFunction) {
    console.log(colors.yellow(`🧪 執行測試: ${testName}`));
    
    try {
      const startTime = Date.now();
      await testFunction();
      const duration = Date.now() - startTime;
      
      this.passed++;
      this.testResults.push({ name: testName, status: 'PASS', duration });
      console.log(colors.green(`✅ ${testName} - 通過 (${duration}ms)`));
      
    } catch (error) {
      this.failed++;
      this.testResults.push({ name: testName, status: 'FAIL', error: error.message });
      console.log(colors.red(`❌ ${testName} - 失敗: ${error.message}`));
    }
  }

  // 測試 MongoDB 連線
  async testConnection() {
    await mongoose.connect(config.mongodb.uri, config.mongodb.options);
    
    // 測試基本操作
    const testDoc = await TestRecord.create({
      sequenceId: 999999,
      data: 'connection-test',
      writtenTo: 'test-node',
      batchId: 'test-batch'
    });
    
    if (!testDoc) {
      throw new Error('無法創建測試文件');
    }
    
    // 清理測試文件
    await TestRecord.deleteOne({ _id: testDoc._id });
  }

  // 測試序列 ID 生成
  async testSequenceGeneration() {
    const { getNextSequenceId } = require('./models');
    
    const id1 = await getNextSequenceId('test_sequence_gen');
    const id2 = await getNextSequenceId('test_sequence_gen');
    
    if (id2 !== id1 + 1) {
      throw new Error(`序列 ID 生成錯誤: ${id1} -> ${id2}`);
    }
    
    // 清理測試計數器
    await mongoose.connection.db.collection('counters').deleteOne({ _id: 'test_sequence_gen' });
  }

  // 測試監控器
  async testMonitor() {
    const monitor = new MongoDBMonitor();
    const success = await monitor.initialize();
    
    if (!success) {
      throw new Error('監控器初始化失敗');
    }
    
    const status = await monitor.checkReplicaSetStatus();
    
    if (!status || !status.set) {
      throw new Error('無法獲取 Replica Set 狀態');
    }
    
    await monitor.stop();
  }

  // 測試寫入器
  async testWriter() {
    const writer = new SequentialWriter();
    const success = await writer.initialize();
    
    if (!success) {
      throw new Error('寫入器初始化失敗');
    }
    
    // 執行小批次寫入
    const results = await writer.performBatchWrite(5);
    
    if (results.length !== 5) {
      throw new Error(`批次寫入數量錯誤: 預期 5，實際 ${results.length}`);
    }
    
    const successCount = results.filter(r => r.success).length;
    if (successCount === 0) {
      throw new Error('所有寫入都失敗了');
    }
    
    await writer.cleanup();
  }

  // 測試驗證器
  async testValidator() {
    const validator = new DataIntegrityValidator();
    const success = await validator.initialize();
    
    if (!success) {
      throw new Error('驗證器初始化失敗');
    }
    
    // 先創建一些測試資料
    const testRecords = [];
    for (let i = 1; i <= 10; i++) {
      testRecords.push({
        sequenceId: 100000 + i,
        data: `validation-test-${i}`,
        writtenTo: 'test-node',
        batchId: 'validation-test-batch'
      });
    }
    
    await TestRecord.insertMany(testRecords);
    
    // 執行驗證
    const result = await validator.performFullValidation('validation-test-batch');
    
    if (!result) {
      throw new Error('驗證執行失敗');
    }
    
    if (!result.sequenceValidation || result.sequenceValidation.totalRecords !== 10) {
      throw new Error(`驗證結果錯誤: 預期 10 筆記錄，實際 ${result.sequenceValidation?.totalRecords}`);
    }
    
    // 清理測試資料
    await TestRecord.deleteMany({ batchId: 'validation-test-batch' });
    await validator.cleanup();
  }

  // 測試故障轉移模擬
  async testFailoverSimulation() {
    // 這個測試需要手動故障轉移，這裡只是檢查是否能檢測到主節點變化
    const monitor = new MongoDBMonitor();
    await monitor.initialize();
    
    const status1 = await monitor.checkReplicaSetStatus();
    const primary1 = status1.members.find(m => m.stateStr === 'PRIMARY');
    
    if (!primary1) {
      throw new Error('找不到主節點');
    }
    
    console.log(colors.blue(`當前主節點: ${primary1.name}`));
    
    await monitor.stop();
  }

  // 測試資料完整性（包含缺失序列）
  async testDataIntegrityWithGaps() {
    const validator = new DataIntegrityValidator();
    await validator.initialize();
    
    // 創建有間隙的測試資料
    const testRecords = [
      { sequenceId: 200001, data: 'gap-test-1', writtenTo: 'test-node', batchId: 'gap-test-batch' },
      { sequenceId: 200002, data: 'gap-test-2', writtenTo: 'test-node', batchId: 'gap-test-batch' },
      // 故意跳過 200003
      { sequenceId: 200004, data: 'gap-test-4', writtenTo: 'test-node', batchId: 'gap-test-batch' },
      { sequenceId: 200005, data: 'gap-test-5', writtenTo: 'test-node', batchId: 'gap-test-batch' }
    ];
    
    await TestRecord.insertMany(testRecords);
    
    const result = await validator.performFullValidation('gap-test-batch');
    
    if (!result || !result.sequenceValidation) {
      throw new Error('驗證執行失敗');
    }
    
    const sv = result.sequenceValidation;
    if (sv.missingSequences.length !== 1 || sv.missingSequences[0] !== 200003) {
      throw new Error(`間隙檢測錯誤: 預期缺失 [200003]，實際缺失 ${JSON.stringify(sv.missingSequences)}`);
    }
    
    if (sv.isValid) {
      throw new Error('應該檢測到資料不完整，但驗證結果顯示完整');
    }
    
    // 清理測試資料
    await TestRecord.deleteMany({ batchId: 'gap-test-batch' });
    await validator.cleanup();
  }

  // 測試效能基準
  async testPerformanceBenchmark() {
    const writer = new SequentialWriter();
    await writer.initialize();
    
    console.log(colors.blue('📊 執行效能基準測試...'));
    
    const startTime = Date.now();
    const results = await writer.performBatchWrite(50);
    const endTime = Date.now();
    
    const duration = endTime - startTime;
    const successCount = results.filter(r => r.success).length;
    const throughput = Math.round((successCount * 1000) / duration);
    
    console.log(colors.white(`  寫入 50 筆記錄耗時: ${duration}ms`));
    console.log(colors.white(`  成功寫入: ${successCount}/50`));
    console.log(colors.white(`  吞吐量: ${throughput} 寫入/秒`));
    
    if (throughput < 10) {
      throw new Error(`效能太低: ${throughput} 寫入/秒 < 10 寫入/秒`);
    }
    
    await writer.cleanup();
  }

  // 執行所有測試
  async runAllTests() {
    console.log(colors.cyan('🚀 開始 MongoDB HA Tester 測試套件'));
    console.log(colors.cyan('═'.repeat(60)));
    
    const startTime = Date.now();
    
    // 基礎功能測試
    await this.runTest('MongoDB 連線測試', () => this.testConnection());
    await this.runTest('序列 ID 生成測試', () => this.testSequenceGeneration());
    
    // 組件測試
    await this.runTest('監控器測試', () => this.testMonitor());
    await this.runTest('寫入器測試', () => this.testWriter());
    await this.runTest('驗證器測試', () => this.testValidator());
    
    // 進階功能測試
    await this.runTest('資料完整性測試（含間隙）', () => this.testDataIntegrityWithGaps());
    await this.runTest('故障轉移模擬測試', () => this.testFailoverSimulation());
    await this.runTest('效能基準測試', () => this.testPerformanceBenchmark());
    
    const endTime = Date.now();
    const totalDuration = endTime - startTime;
    
    // 顯示測試結果摘要
    this.displayResults(totalDuration);
    
    // 關閉連線
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    
    return this.failed === 0;
  }

  // 顯示測試結果
  displayResults(totalDuration) {
    console.log(colors.cyan('\n📋 測試結果摘要'));
    console.log(colors.cyan('═'.repeat(60)));
    
    console.log(colors.white(`總測試數: ${this.passed + this.failed}`));
    console.log(colors.white(`通過: ${colors.green(this.passed)}`));
    console.log(colors.white(`失敗: ${colors.red(this.failed)}`));
    console.log(colors.white(`成功率: ${Math.round((this.passed / (this.passed + this.failed)) * 100)}%`));
    console.log(colors.white(`總耗時: ${totalDuration}ms`));
    
    console.log(colors.yellow('\n📊 詳細結果:'));
    this.testResults.forEach(result => {
      const statusColor = result.status === 'PASS' ? colors.green : colors.red;
      const statusText = result.status === 'PASS' ? '✅ PASS' : '❌ FAIL';
      const duration = result.duration ? ` (${result.duration}ms)` : '';
      const error = result.error ? ` - ${result.error}` : '';
      
      console.log(colors.white(`  ${statusColor(statusText)} ${result.name}${duration}${error}`));
    });
    
    console.log(colors.cyan('═'.repeat(60)));
    
    if (this.failed === 0) {
      console.log(colors.green('🎉 所有測試通過！'));
    } else {
      console.log(colors.red('⚠️ 有測試失敗，請檢查上述錯誤訊息'));
    }
  }
}

// 主程式
async function main() {
  console.log(colors.rainbow('🧪 MongoDB High Availability Tester - 測試套件'));
  console.log(colors.white(`時間: ${moment().format('YYYY-MM-DD HH:mm:ss')}`));
  console.log('');
  
  const testSuite = new TestSuite();
  
  try {
    const success = await testSuite.runAllTests();
    process.exit(success ? 0 : 1);
    
  } catch (error) {
    console.error(colors.red('❌ 測試套件執行失敗:'), error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 如果直接執行此檔案，啟動測試
if (require.main === module) {
  main();
}

module.exports = TestSuite;
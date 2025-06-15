#!/bin/bash

# MongoDB HA Tester - Docker 本地測試腳本

set -e

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 函數定義
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 檢查 Docker 環境
check_docker() {
    log_info "檢查 Docker 環境..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安裝"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker daemon 未運行"
        exit 1
    fi
    
    log_success "Docker 環境正常"
}

# 建立 Docker 映像
build_image() {
    log_info "建立 MongoDB HA Tester Docker 映像..."
    
    docker build -t mongodb-ha-tester:local .
    
    if [ $? -eq 0 ]; then
        log_success "映像建立成功"
    else
        log_error "映像建立失敗"
        exit 1
    fi
}

# 建立測試網路
create_network() {
    log_info "建立測試網路..."
    
    if docker network ls | grep -q "mongodb-test-network"; then
        log_warning "網路已存在，跳過建立"
    else
        docker network create mongodb-test-network
        log_success "測試網路建立成功"
    fi
}

# 啟動 MongoDB Replica Set (簡化版)
start_mongodb() {
    log_info "啟動 MongoDB 測試實例..."
    
    # 停止現有容器
    docker stop mongodb-test-primary mongodb-test-secondary 2>/dev/null || true
    docker rm mongodb-test-primary mongodb-test-secondary 2>/dev/null || true
    
    # 啟動主節點
    docker run -d \
        --name mongodb-test-primary \
        --network mongodb-test-network \
        -p 27017:27017 \
        -e MONGO_INITDB_ROOT_USERNAME=admin \
        -e MONGO_INITDB_ROOT_PASSWORD=password123 \
        mongo:7.0 \
        mongod --replSet rs0 --bind_ip_all
    
    # 啟動副節點
    docker run -d \
        --name mongodb-test-secondary \
        --network mongodb-test-network \
        -p 27018:27017 \
        mongo:7.0 \
        mongod --replSet rs0 --bind_ip_all
    
    log_info "等待 MongoDB 啟動..."
    sleep 10
    
    # 初始化 Replica Set
    docker exec mongodb-test-primary mongosh --eval "
    rs.initiate({
        _id: 'rs0',
        members: [
            { _id: 0, host: 'mongodb-test-primary:27017', priority: 2 },
            { _id: 1, host: 'mongodb-test-secondary:27017', priority: 1 }
        ]
    })
    "
    
    log_info "等待 Replica Set 初始化..."
    sleep 15
    
    # 建立測試用戶
    docker exec mongodb-test-primary mongosh --eval "
    db.getSiblingDB('admin').createUser({
        user: 'admin',
        pwd: 'password123',
        roles: ['root']
    })
    " 2>/dev/null || log_warning "用戶可能已存在"
    
    log_success "MongoDB Replica Set 啟動成功"
}

# 運行 HA Tester
run_tester() {
    log_info "啟動 MongoDB HA Tester..."
    
    # 停止現有測試容器
    docker stop mongodb-ha-tester 2>/dev/null || true
    docker rm mongodb-ha-tester 2>/dev/null || true
    
    # 啟動 HA Tester
    docker run -d \
        --name mongodb-ha-tester \
        --network mongodb-test-network \
        --env-file .env \
        -e MONGODB_URI="mongodb://admin:password123@mongodb-test-primary:27017,mongodb-test-secondary:27017/mongodb-ha-test?replicaSet=rs0&authSource=admin" \
        mongodb-ha-tester:local
    
    log_success "HA Tester 啟動成功"
}

# 顯示日誌
show_logs() {
    log_info "顯示 HA Tester 日誌 (Ctrl+C 退出)..."
    docker logs -f mongodb-ha-tester
}

# 執行測試
run_test() {
    log_info "執行 HA 測試..."
    
    docker run --rm \
        --network mongodb-test-network \
        --env-file .env \
        -e MONGODB_URI="mongodb://admin:password123@mongodb-test-primary:27017,mongodb-test-secondary:27017/mongodb-ha-test?replicaSet=rs0&authSource=admin" \
        mongodb-ha-tester:local \
        node index.js single
}

# 故障轉移測試
failover_test() {
    log_info "執行故障轉移測試..."
    
    log_info "1. 啟動持續測試..."
    docker run -d \
        --name mongodb-ha-tester-failover \
        --network mongodb-test-network \
        --env-file .env \
        -e MONGODB_URI="mongodb://admin:password123@mongodb-test-primary:27017,mongodb-test-secondary:27017/mongodb-ha-test?replicaSet=rs0&authSource=admin" \
        mongodb-ha-tester:local
    
    sleep 30
    
    log_warning "2. 模擬主節點故障..."
    docker stop mongodb-test-primary
    
    log_info "3. 等待故障轉移 (60秒)..."
    sleep 60
    
    log_info "4. 恢復主節點..."
    docker start mongodb-test-primary
    
    sleep 30
    
    log_info "5. 顯示測試結果..."
    docker logs mongodb-ha-tester-failover --tail 50
    
    # 清理
    docker stop mongodb-ha-tester-failover
    docker rm mongodb-ha-tester-failover
    
    log_success "故障轉移測試完成"
}

# 清理環境
cleanup() {
    log_info "清理測試環境..."
    
    # 停止並移除容器
    docker stop mongodb-test-primary mongodb-test-secondary mongodb-ha-tester 2>/dev/null || true
    docker rm mongodb-test-primary mongodb-test-secondary mongodb-ha-tester 2>/dev/null || true
    
    # 移除網路
    docker network rm mongodb-test-network 2>/dev/null || true
    
    # 移除映像 (可選)
    read -p "是否移除 Docker 映像? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker rmi mongodb-ha-tester:local 2>/dev/null || true
        log_success "映像已移除"
    fi
    
    log_success "環境清理完成"
}

# 顯示幫助
show_help() {
    echo "MongoDB HA Tester - Docker 測試腳本"
    echo ""
    echo "使用方式:"
    echo "  $0 [command]"
    echo ""
    echo "命令:"
    echo "  build       建立 Docker 映像"
    echo "  start       啟動完整測試環境"
    echo "  logs        顯示 HA Tester 日誌"
    echo "  test        執行單次測試"
    echo "  failover    執行故障轉移測試"
    echo "  cleanup     清理測試環境"
    echo "  help        顯示此幫助訊息"
    echo ""
    echo "範例:"
    echo "  $0 build && $0 start && $0 logs"
    echo "  $0 failover"
    echo "  $0 cleanup"
}

# 主程式
main() {
    case "${1:-help}" in
        "build")
            check_docker
            build_image
            ;;
        "start")
            check_docker
            create_network
            start_mongodb
            run_tester
            ;;
        "logs")
            show_logs
            ;;
        "test")
            check_docker
            run_test
            ;;
        "failover")
            check_docker
            failover_test
            ;;
        "cleanup")
            cleanup
            ;;
        "help"|*)
            show_help
            ;;
    esac
}

# 捕捉 Ctrl+C
trap cleanup EXIT

# 執行主程式
main "$@"
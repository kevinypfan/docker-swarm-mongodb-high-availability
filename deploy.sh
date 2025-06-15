#!/bin/bash

# MongoDB HA Testing Suite - 部署腳本

set -e

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
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

log_header() {
    echo -e "${PURPLE}$1${NC}"
}

# 顯示歡迎訊息
show_banner() {
    echo -e "${CYAN}"
    echo "═══════════════════════════════════════════════════════════════════"
    echo "🔧 MongoDB High Availability Testing Suite"
    echo "   Docker Swarm 部署工具"
    echo "═══════════════════════════════════════════════════════════════════"
    echo -e "${NC}"
}

# 檢查前置需求
check_requirements() {
    log_header "🔍 檢查部署前置需求..."
    
    # 檢查 Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安裝，請先安裝 Docker"
        exit 1
    fi
    
    # 檢查 Docker daemon
    if ! docker info &> /dev/null; then
        log_error "Docker daemon 未運行，請啟動 Docker"
        exit 1
    fi
    
    # 檢查 Docker Swarm
    if ! docker info | grep -q "Swarm: active"; then
        log_warning "Docker Swarm 未初始化，正在初始化..."
        docker swarm init
        log_success "Docker Swarm 初始化完成"
    else
        log_success "Docker Swarm 已啟用"
    fi
    
    log_success "前置需求檢查完成"
}

# 載入環境變數
load_env() {
    log_header "⚙️ 載入環境設定..."
    
    # 檢查 mongodb-ha-tester/.env 檔案
    if [ -f "mongodb-ha-tester/.env" ]; then
        log_info "載入 mongodb-ha-tester/.env 檔案..."
        export $(cat mongodb-ha-tester/.env | grep -v '^#' | xargs)
    elif [ -f "mongodb-ha-tester/.env.example" ]; then
        log_warning ".env 檔案不存在，使用 .env.example 建立預設設定"
        cp mongodb-ha-tester/.env.example mongodb-ha-tester/.env
        log_info "請編輯 mongodb-ha-tester/.env 檔案設定你的連線資訊"
        
        # 提示用戶是否需要設定本地開發環境
        read -p "是否要設定本地開發環境? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            log_info "切換到本地開發 URI..."
            sed -i.bak 's/^MONGODB_URI=mongodb:\/\/admin:password123@mongodb-primary/# MONGODB_URI=mongodb:\/\/admin:password123@mongodb-primary/' mongodb-ha-tester/.env
            sed -i.bak 's/^# MONGODB_URI=mongodb:\/\/admin:password123@localhost/MONGODB_URI=mongodb:\/\/admin:password123@localhost/' mongodb-ha-tester/.env
            log_success "已切換到本地開發模式"
        fi
    fi
    
    # 設定部署相關的預設值
    export DOCKER_USERNAME=${DOCKER_USERNAME:-yourusername}
    export MONGO_ROOT_PASSWORD=${MONGO_ROOT_PASSWORD:-password123}
    export MONGODB_NETWORK=${MONGODB_NETWORK:-mongodb-network}
    export LOG_LEVEL=${LOG_LEVEL:-info}
    
    log_info "Docker Hub 用戶: $DOCKER_USERNAME"
    log_info "MongoDB 網路: $MONGODB_NETWORK" 
    log_info "日誌等級: $LOG_LEVEL"
    
    # 顯示當前使用的 MongoDB URI (隱藏密碼)
    if [ -n "$MONGODB_URI" ]; then
        masked_uri=$(echo "$MONGODB_URI" | sed 's/password123/***/')
        log_info "MongoDB URI: $masked_uri"
    fi
    
    log_success "環境設定載入完成"
}

# 建立網路
create_network() {
    log_header "🌐 建立 Docker 網路..."
    
    if docker network ls | grep -q "$MONGODB_NETWORK"; then
        log_warning "網路 $MONGODB_NETWORK 已存在，跳過建立"
    else
        docker network create --driver overlay --attachable $MONGODB_NETWORK
        log_success "網路 $MONGODB_NETWORK 建立成功"
    fi
}

# 建立 Docker 映像
build_image() {
    log_header "🔨 建立 MongoDB HA Tester Docker 映像..."
    
    cd mongodb-ha-tester
    
    # 檢查是否有本地變更需要建立
    if [ "$1" = "--build" ] || [ "$1" = "-b" ]; then
        log_info "正在建立 Docker 映像..."
        docker build -t $DOCKER_USERNAME/mongodb-ha-tester:latest .
        
        if [ $? -eq 0 ]; then
            log_success "映像建立成功"
            
            # 詢問是否推送到 Docker Hub
            read -p "是否推送映像到 Docker Hub? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                log_info "推送映像到 Docker Hub..."
                docker push $DOCKER_USERNAME/mongodb-ha-tester:latest
                log_success "映像推送完成"
            fi
        else
            log_error "映像建立失敗"
            exit 1
        fi
    else
        log_info "使用預建映像: $DOCKER_USERNAME/mongodb-ha-tester:latest"
        log_info "如需重新建立，請使用 --build 參數"
    fi
    
    cd ..
}

# 部署服務
deploy_services() {
    log_header "🚀 部署 MongoDB HA Testing Suite..."
    
    cd deployment
    
    # 替換 docker-compose.yml 中的環境變數
    log_info "準備部署檔案..."
    
    # 部署 stack
    log_info "部署 MongoDB Replica Set + HA Tester..."
    docker stack deploy -c docker-compose.yml mongodb-stack
    
    if [ $? -eq 0 ]; then
        log_success "服務部署成功"
    else
        log_error "服務部署失敗"
        exit 1
    fi
    
    cd ..
}

# 檢查部署狀態
check_deployment() {
    log_header "📊 檢查部署狀態..."
    
    # 等待服務啟動
    log_info "等待服務啟動中..."
    sleep 10
    
    # 顯示服務狀態
    echo -e "${CYAN}服務清單:${NC}"
    docker service ls
    
    echo ""
    echo -e "${CYAN}MongoDB HA Tester 狀態:${NC}"
    docker service ps mongodb-stack_mongodb-ha-tester --no-trunc
    
    echo ""
    echo -e "${CYAN}MongoDB 主節點狀態:${NC}"
    docker service ps mongodb-stack_mongodb-primary --no-trunc
}

# 顯示連線資訊
show_connection_info() {
    log_header "📋 連線資訊"
    
    echo -e "${CYAN}MongoDB 連線資訊:${NC}"
    echo "  外部存取:"
    echo "    主節點: localhost:27017"
    echo "    副節點1: localhost:27018" 
    echo "    副節點2: localhost:27019"
    echo ""
    echo "  容器內部:"
    echo "    mongodb://admin:$MONGO_ROOT_PASSWORD@mongodb-primary:27017,mongodb-secondary1:27017,mongodb-secondary2:27017/mydb?replicaSet=rs0&authSource=admin"
    echo ""
    echo -e "${CYAN}HA Tester 管理指令:${NC}"
    echo "  查看日誌: docker service logs -f mongodb-stack_mongodb-ha-tester"
    echo "  重啟服務: docker service update --force mongodb-stack_mongodb-ha-tester"
    echo "  縮放服務: docker service scale mongodb-stack_mongodb-ha-tester=1"
    echo ""
    echo -e "${CYAN}故障轉移測試:${NC}"
    echo "  模擬主節點故障: docker service scale mongodb-stack_mongodb-primary=0"
    echo "  恢復主節點: docker service scale mongodb-stack_mongodb-primary=1"
}

# 監控日誌
monitor_logs() {
    log_header "📖 監控 HA Tester 日誌"
    log_info "開始監控日誌，按 Ctrl+C 退出..."
    docker service logs -f mongodb-stack_mongodb-ha-tester
}

# 清理環境
cleanup() {
    log_header "🧹 清理部署環境"
    
    log_warning "這將移除所有 MongoDB 服務和資料！"
    read -p "確定要繼續嗎? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "移除 MongoDB stack..."
        docker stack rm mongodb-stack
        
        log_info "等待服務完全停止..."
        sleep 15
        
        # 詢問是否移除 volumes
        read -p "是否移除所有資料 volumes? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            log_warning "移除 volumes..."
            docker volume prune -f
        fi
        
        # 詢問是否移除網路
        read -p "是否移除網路 $MONGODB_NETWORK? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker network rm $MONGODB_NETWORK 2>/dev/null || true
        fi
        
        log_success "清理完成"
    else
        log_info "取消清理操作"
    fi
}

# 顯示幫助
show_help() {
    echo "MongoDB HA Testing Suite - 部署腳本"
    echo ""
    echo "使用方式:"
    echo "  $0 [command] [options]"
    echo ""
    echo "命令:"
    echo "  deploy      部署完整測試套件 (預設)"
    echo "  build       建立 HA Tester Docker 映像"
    echo "  logs        監控 HA Tester 日誌" 
    echo "  status      檢查部署狀態"
    echo "  info        顯示連線資訊"
    echo "  cleanup     清理部署環境"
    echo "  help        顯示此幫助訊息"
    echo ""
    echo "選項:"
    echo "  --build     在部署前重新建立映像"
    echo ""
    echo "範例:"
    echo "  $0 deploy           # 部署服務"
    echo "  $0 deploy --build   # 重新建立映像並部署"
    echo "  $0 logs             # 監控日誌"
    echo "  $0 cleanup          # 清理環境"
}

# 主程式
main() {
    show_banner
    
    case "${1:-deploy}" in
        "deploy")
            load_env
            check_requirements
            create_network
            build_image "$2"
            deploy_services
            check_deployment
            show_connection_info
            echo ""
            log_success "部署完成！使用 '$0 logs' 監控日誌"
            ;;
        "build")
            load_env
            build_image "--build"
            ;;
        "logs")
            monitor_logs
            ;;
        "status")
            check_deployment
            ;;
        "info")
            load_env
            show_connection_info
            ;;
        "cleanup")
            cleanup
            ;;
        "help"|*)
            show_help
            ;;
    esac
}

# 捕捉中斷信號
trap 'echo -e "\n${YELLOW}操作已中斷${NC}"; exit 1' INT

# 執行主程式
main "$@"
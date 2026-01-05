function main(config, profileName) {
  // 确保 config 存在
  if (!config || typeof config !== 'object') {
    console.error('无效的配置对象');
    return { proxies: [], 'proxy-groups': [] };
  }

  // 获取原始代理列表
  const proxies = config.proxies || [];
  const proxyNames = proxies.map(p => p.name || '');
  let availableProxies = [...proxyNames];

  // 测试目标列表（HTTP）
  const testUrls = [
    'http://www.gstatic.cn/generate_204', // 国内优化
    'http://captive.apple.com', // Apple 检测
    'tcp://9.9.9.9:53', // Quad9 DNS
    'tcp://208.67.222.222:443' // OpenDNS
  ];
  const selectedTestUrl = testUrls[0]; // 默认使用国内 Google

  // 更新代理组
  function updateProxyGroup() {
    try {
      // 直接使用所有代理节点，依赖 Clash 核心的健康检查
      availableProxies = [...proxyNames];
      if (availableProxies.length === 0) {
        availableProxies = ['DIRECT'];
        console.log('无可用节点，使用 DIRECT');
      } else {
        console.log('可用节点（总数：', availableProxies.length, '）：', availableProxies);
      }

      // 更新主代理组（🔰 选择节点 和 🚀 节点选择）
      const mainGroups = config['proxy-groups'] && config['proxy-groups'].filter(group => 
        group.name === '🔰 选择节点' || group.name === '🚀 节点选择'
      );
      
      if (mainGroups) {
        mainGroups.forEach(group => {
          const existingProxies = group.proxies || [];
          group.proxies = [...new Set(['♻️ 故障切换', '♻️ 负载均衡', ...availableProxies, ...existingProxies.filter(p => p !== '♻️ 故障切换' && p !== '♻️ 负载均衡')])];
          console.log(`更新代理组 ${group.name}:`, group.proxies);
        });
      } else {
        console.error('未找到主代理组: 🔰 选择节点 或 🚀 节点选择');
      }

      // 更新其他引用主代理组或单个节点的组
      if (config['proxy-groups']) {
        config['proxy-groups'].forEach(group => {
          if (group.name !== '♻️ 负载均衡' && group.name !== '♻️ 故障切换' && group.proxies && (
            group.proxies.includes('🔰 选择节点') || 
            group.proxies.includes('🚀 节点选择') || 
            group.proxies.some(p => proxyNames.includes(p))
          )) {
            group.proxies = [...new Set(['♻️ 故障切换', '♻️ 负载均衡', ...availableProxies, 'DIRECT', 'REJECT'].filter(p => 
              group.proxies.includes(p) || p === 'DIRECT' || p === 'REJECT' || p === '♻️ 故障切换' || p === '♻️ 负载均衡' || availableProxies.includes(p)
            ))];
            console.log(`更新其他代理组 ${group.name}:`, group.proxies);
          }
        });
      }

      console.log('已更新所有代理组，使用测试目标:', selectedTestUrl);
    } catch (error) {
      console.error('更新代理组失败：', error);
    }
  }

  // 添加代理组（故障切换 和 负载均衡）
  try {
    if (config['proxy-groups']) {
      // 添加/更新 ♻️ 负载均衡 组
      let loadBalanceGroup = config['proxy-groups'].find(group => group.name === '♻️ 负载均衡');
      console.log('所有节点列表（总数：', proxyNames.length, '）：', proxyNames);

      if (!loadBalanceGroup) {
        loadBalanceGroup = {
          name: '♻️ 负载均衡',
          type: 'load-balance',
          strategy: 'round-robin',
          url: selectedTestUrl,
          interval: 300,
          timeout: 8000,
          proxies: [...proxyNames]
        };
        config['proxy-groups'].push(loadBalanceGroup);
        console.log('已创建 ♻️ 负载均衡 代理组:', loadBalanceGroup.proxies, '测试目标:', selectedTestUrl);
      } else {
        loadBalanceGroup.proxies = [...proxyNames];
        loadBalanceGroup.url = selectedTestUrl;
        loadBalanceGroup.interval = 300;
        loadBalanceGroup.timeout = 8000;
        loadBalanceGroup.strategy = 'round-robin';
        console.log('已更新 ♻️ 负载均衡 代理组:', loadBalanceGroup.proxies, '测试目标:', selectedTestUrl);
      }

      // 添加/更新 ♻️ 故障切换 组
      let fallbackGroup = config['proxy-groups'].find(group => group.name === '♻️ 故障切换');
      if (!fallbackGroup) {
        fallbackGroup = {
          name: '♻️ 故障切换',
          type: 'fallback',
          url: selectedTestUrl,
          interval: 60,
          timeout: 8000,
          proxies: ['♻️ 负载均衡', ...proxyNames, 'DIRECT']
        };
        config['proxy-groups'].push(fallbackGroup);
        console.log('已创建 ♻️ 故障切换 代理组:', fallbackGroup.proxies, '测试目标:', selectedTestUrl);
      } else {
        fallbackGroup.proxies = ['♻️ 负载均衡', ...proxyNames, 'DIRECT'];
        fallbackGroup.url = selectedTestUrl;
        fallbackGroup.interval = 60;
        fallbackGroup.timeout = 8000;
        console.log('已更新 ♻️ 故障切换 代理组:', fallbackGroup.proxies, '测试目标:', selectedTestUrl);
      }
    } else {
      console.error('未找到 proxy-groups');
      config['proxy-groups'] = [];
    }

    // 确保 TUN 模式和日志级别
    config.tun = {
      enable: true,
      stack: 'system',
      'auto-route': true,
      'auto-detect-interface': true
    };
    config['log-level'] = 'debug';
    console.log('已启用 TUN 模式:', config.tun, '日志级别: debug');
  } catch (error) {
    console.error('添加代理组或配置 TUN 模式失败：', error);
  }

  // 执行初始更新
  try {
    updateProxyGroup();
  } catch (error) {
    console.error('初始更新失败：', error);
  }

  // 返回纯 JSON 配置
  return JSON.parse(JSON.stringify(config));
}

const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const https = require('https');

let currentAgent = null;

async function fetchProxies() {
    try {
        const res = await axios.get('https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt');
        const proxies = res.data.split('\n').filter(p => p.trim());
        return proxies.sort(() => 0.5 - Math.random());
    } catch (err) {
        console.error('Failed to fetch proxy list:', err.message);
        return [];
    }
}

async function testDirectConnection() {
    return new Promise((resolve) => {
        let isResolved = false;
        const timeoutId = setTimeout(() => {
            if (!isResolved) {
                isResolved = true;
                resolve(false);
            }
        }, 5000);

        const req = https.get('https://api.telegram.org/bot' + process.env.TELEGRAM_BOT_TOKEN + '/getMe', (res) => {
            if (!isResolved) {
                isResolved = true;
                clearTimeout(timeoutId);
                // Status 200 is success, but 401/404 also means Telegram is reachable directly (e.g. wrong/unauthorized token)
                if (res.statusCode === 200 || res.statusCode === 401 || res.statusCode === 404) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            }
            res.resume();
        });
        
        req.on('error', () => {
            if (!isResolved) {
                isResolved = true;
                clearTimeout(timeoutId);
                resolve(false);
            }
        });
    });
}

async function testProxy(proxyUrl) {
    return new Promise((resolve) => {
        let isResolved = false;
        const timeoutId = setTimeout(() => {
            if (!isResolved) {
                isResolved = true;
                resolve(null);
            }
        }, 5000);

        const agent = new HttpsProxyAgent(proxyUrl);
        const req = https.get('https://api.telegram.org/bot' + process.env.TELEGRAM_BOT_TOKEN + '/getMe', { agent }, (res) => {
            if (!isResolved) {
                isResolved = true;
                clearTimeout(timeoutId);
                if (res.statusCode === 200) {
                    resolve(agent);
                } else {
                    resolve(null);
                }
            }
            res.resume();
        });
        
        req.on('error', () => {
            if (!isResolved) {
                isResolved = true;
                clearTimeout(timeoutId);
                resolve(null);
            }
        });
    });
}

async function getWorkingAgent() {
    if (currentAgent) {
        return currentAgent === 'DIRECT' ? null : currentAgent;
    }
    
    console.log('[Telegram Proxy] Checking if direct connection to Telegram works...');
    const directWorks = await testDirectConnection();
    if (directWorks) {
        console.log('[Telegram Proxy] Direct connection works. No proxy needed.');
        currentAgent = 'DIRECT';
        return null;
    }
    
    console.log('[Telegram Proxy] Direct connection failed. Fetching new proxy list...');
    const proxies = await fetchProxies();
    
    const batchSize = 15;
    for (let i = 0; i < proxies.length; i += batchSize) {
        const batch = proxies.slice(i, i + batchSize);
        console.log(`[Telegram Proxy] Testing batch ${i / batchSize + 1} (${batch.length} proxies)...`);
        
        const testPromises = batch.map(async (proxy) => {
            const proxyUrl = `http://${proxy.trim()}`;
            const agent = await testProxy(proxyUrl);
            if (agent) {
                return { proxyUrl, agent };
            }
            return null;
        });
        
        const results = await Promise.all(testPromises);
        const working = results.find(r => r !== null);
        
        if (working) {
            console.log(`[Telegram Proxy] Found working proxy: ${working.proxyUrl}`);
            currentAgent = working.agent;
            return currentAgent;
        }
    }
    
    console.log('[Telegram Proxy] No working proxies found in the entire list.');
    return null;
}

function invalidateAgent() {
    console.log('[Telegram Proxy] Invalidated current proxy.');
    currentAgent = null;
}

module.exports = { getWorkingAgent, invalidateAgent };

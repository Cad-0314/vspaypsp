const axios = require('axios');

async function testRedirect() {
    const orderId = 'PI20260316134618605Lu1qbR'; // Example from logs
    const baseUrl = 'http://localhost:3000'; // Assuming local dev
    
    console.log(`Testing redirect for order: ${orderId}`);
    try {
        const response = await axios.get(`${baseUrl}/pay/${orderId}`, {
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 400
        });
        
        if (response.status === 302) {
            console.log('SUCCESS: Received 302 Redirect');
            console.log('Redirect Location:', response.headers.location);
        } else {
            console.log('FAILED: Expected 302, got', response.status);
        }
    } catch (error) {
        if (error.response && error.response.status === 302) {
            console.log('SUCCESS: Received 302 Redirect');
            console.log('Redirect Location:', error.response.headers.location);
        } else {
            console.error('Error during test:', error.message);
            console.log('Note: Ensure the server is running and the order exists in the DB.');
        }
    }
}

testRedirect();

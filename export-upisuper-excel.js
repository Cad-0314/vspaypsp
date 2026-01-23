require('dotenv').config();
const sequelize = require('./src/config/database');
const { QueryTypes } = require('sequelize');
const XLSX = require('xlsx');
const path = require('path');

async function exportUpiSuperOrders() {
    try {
        console.log('Connecting to database...');
        await sequelize.authenticate();
        console.log('Connected successfully!\n');

        const query = `
            SELECT 
                id,
                merchantId,
                orderId,
                channelName,
                type,
                payoutType,
                amount,
                fee,
                netAmount,
                status,
                providerOrderId,
                utr,
                payUrl,
                callbackUrl,
                callbackSent,
                callbackAttempts,
                param,
                skipUrl,
                expiresAt,
                createdAt,
                updatedAt
            FROM orders 
            WHERE channelName = 'upi super' 
                AND DATE(createdAt) BETWEEN '2026-01-15' AND '2026-01-23'
            ORDER BY createdAt;
        `;

        const orders = await sequelize.query(query, { type: QueryTypes.SELECT });

        console.log(`Found ${orders.length} UPI Super orders from Jan 15-23, 2026\n`);

        if (orders.length === 0) {
            console.log('No orders found for the specified date range.');
            await sequelize.close();
            return;
        }

        // Format data for Excel
        const excelData = orders.map((order, index) => ({
            'S.No': index + 1,
            'ID': order.id,
            'Merchant ID': order.merchantId,
            'Order ID': order.orderId,
            'Channel': order.channelName,
            'Type': order.type,
            'Payout Type': order.payoutType || 'N/A',
            'Amount (₹)': parseFloat(order.amount),
            'Fee (₹)': parseFloat(order.fee),
            'Net Amount (₹)': parseFloat(order.netAmount),
            'Status': order.status,
            'Provider Order ID': order.providerOrderId || 'N/A',
            'UTR': order.utr || 'N/A',
            'Pay URL': order.payUrl || 'N/A',
            'Callback URL': order.callbackUrl || 'N/A',
            'Callback Sent': order.callbackSent ? 'Yes' : 'No',
            'Callback Attempts': order.callbackAttempts,
            'Param': order.param || 'N/A',
            'Skip URL': order.skipUrl || 'N/A',
            'Expires At': order.expiresAt ? new Date(order.expiresAt).toLocaleString('en-IN') : 'N/A',
            'Created At': new Date(order.createdAt).toLocaleString('en-IN'),
            'Updated At': new Date(order.updatedAt).toLocaleString('en-IN')
        }));

        // Create workbook and worksheet
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(excelData);

        // Set column widths
        worksheet['!cols'] = [
            { wch: 5 },   // S.No
            { wch: 40 },  // ID
            { wch: 12 },  // Merchant ID
            { wch: 22 },  // Order ID
            { wch: 12 },  // Channel
            { wch: 8 },   // Type
            { wch: 12 },  // Payout Type
            { wch: 12 },  // Amount
            { wch: 10 },  // Fee
            { wch: 14 },  // Net Amount
            { wch: 10 },  // Status
            { wch: 25 },  // Provider Order ID
            { wch: 15 },  // UTR
            { wch: 50 },  // Pay URL
            { wch: 50 },  // Callback URL
            { wch: 12 },  // Callback Sent
            { wch: 15 },  // Callback Attempts
            { wch: 20 },  // Param
            { wch: 50 },  // Skip URL
            { wch: 22 },  // Expires At
            { wch: 22 },  // Created At
            { wch: 22 },  // Updated At
        ];

        XLSX.utils.book_append_sheet(workbook, worksheet, 'UPI Super Orders');

        // Add summary sheet
        const summaryData = [
            { 'Metric': 'Total Orders', 'Value': orders.length },
            { 'Metric': 'Date Range', 'Value': 'January 15-23, 2026' },
            { 'Metric': 'Channel', 'Value': 'UPI Super (Fendpay)' },
            { 'Metric': 'Total Amount (₹)', 'Value': orders.reduce((sum, o) => sum + parseFloat(o.amount), 0).toFixed(2) },
            { 'Metric': 'Total Fee (₹)', 'Value': orders.reduce((sum, o) => sum + parseFloat(o.fee), 0).toFixed(2) },
            { 'Metric': 'Total Net Amount (₹)', 'Value': orders.reduce((sum, o) => sum + parseFloat(o.netAmount), 0).toFixed(2) },
            { 'Metric': '', 'Value': '' },
            { 'Metric': 'Status Breakdown', 'Value': '' },
        ];

        // Count by status
        const statusCounts = {};
        orders.forEach(o => {
            statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
        });
        Object.entries(statusCounts).forEach(([status, count]) => {
            summaryData.push({ 'Metric': `  - ${status}`, 'Value': count });
        });

        const summarySheet = XLSX.utils.json_to_sheet(summaryData);
        summarySheet['!cols'] = [{ wch: 25 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

        // Save to Desktop
        const fileName = 'UPI_Super_Orders_Jan15-23_2026.xlsx';
        const filePath = path.join('C:\\Users\\akhan\\OneDrive\\Desktop', fileName);

        XLSX.writeFile(workbook, filePath);

        console.log('='.repeat(60));
        console.log('EXCEL FILE CREATED SUCCESSFULLY!');
        console.log('='.repeat(60));
        console.log(`File: ${filePath}`);
        console.log(`Total Orders: ${orders.length}`);
        console.log(`Total Amount: ₹${orders.reduce((sum, o) => sum + parseFloat(o.amount), 0).toFixed(2)}`);

        await sequelize.close();
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

exportUpiSuperOrders();

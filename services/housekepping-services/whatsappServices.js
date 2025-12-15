import https from 'https';
import logger from '../../utils/logger.js';

const {
  MAYTAPI_PRODUCT_ID,
  MAYTAPI_PHONE_ID,
  MAYTAPI_TOKEN,
  MAYTAPI_GROUP_ID
} = process.env;

const missingConfig = () =>
  !MAYTAPI_PRODUCT_ID || !MAYTAPI_PHONE_ID || !MAYTAPI_TOKEN || !MAYTAPI_GROUP_ID;

const formatLocalDateTime = (d = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const sendRequest = (body) =>
  new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: 'api.maytapi.com',
        path: `/api/${MAYTAPI_PRODUCT_ID}/${MAYTAPI_PHONE_ID}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'x-maytapi-key': MAYTAPI_TOKEN
        },
        timeout: 10_000
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            const err = new Error(`WhatsApp send failed with status ${res.statusCode}`);
            logger.error({ status: res.statusCode, body: data }, err.message);
            reject(err);
          }
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('WhatsApp send timed out'));
    });

    req.write(payload);
    req.end();
  });

const notifyAssignmentUpdate = async (task) => {
  if (missingConfig()) {
    logger.warn('WhatsApp config missing; skipping notify');
    return false;
  }

  const message = [
    'Task Updated',
    `ID: ${task.id || '-'}`,
    `Department: ${task.department || '-'}`,
    `Description: ${task.task_description || '-'}`,
    `Status: ${task.status || '-'}`,
    `Remark: ${task.remark || '-'}`,
     `Doer 1: ${task.name || '-'}`,
      `Doer 2: ${task.doer_name2 || '-'}`,
       `Confirm by Hod: ${task.attachment || '-'}`,
    `Date: ${formatLocalDateTime()}`
  ].join('\n');

  try {
    await sendRequest({
      to_number: MAYTAPI_GROUP_ID,
      type: 'text',
      message
    });
    logger.info('WhatsApp notification sent');
    return true;
  } catch (err) {
    logger.error({ err }, 'WhatsApp notification failed');
    return false;
  }
};



export { notifyAssignmentUpdate };

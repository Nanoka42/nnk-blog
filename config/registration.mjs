// Approved record for nanoka.tv (2026-09-16). Guangdong requires the subject
// number in the footer; keep the full website number for deployment records.
// https://help.aliyun.com/zh/icp-filing/icp-filing-regulations-for-guangdong
export const icpRegistration = {
  number: '粤ICP备2026138999号',
  websiteNumber: '粤ICP备2026138999号-1',
  url: 'https://beian.miit.gov.cn/',
};

// Record and verification URL supplied by the site owner (2026-10-22).
// Registration.astro imports the official icon from assets/备案图标.png.
/** @type {{ number: string; url: string } | null} */
export const publicSecurityRegistration = {
  number: '粤公网安备44090202001410号',
  url: 'https://beian.mps.gov.cn/#/query/webSearch?code=44090202001410',
};

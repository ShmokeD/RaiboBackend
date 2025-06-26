 const DB_NAME = 'raibo'

const jobType = [
    //User
    'reset-password',
    'verify-user-email',
    'user-welcome',
    'order-placed',
    'out-for-delivery',
    'delivered',
    //Sellers
    'verify-company-email',
    'kyc-start',
    'kyc-complete',
    'product-added',
    'product-modified',
    'product-purchased-by-user',
    'product-pickedup',
    'product-delivered',
    'customer-review',
    'product-dispute'
];

export { DB_NAME, jobType };

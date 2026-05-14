// Basic usage
import { createAuditLog, AUDIT_ACTIONS, AUDIT_ENTITIES, AUDIT_SEVERITY } from './auditLog';

// Simple log
await createAuditLog(
  shopId,
  userId,
  AUDIT_ACTIONS.PRODUCT_CREATE,
  AUDIT_ENTITIES.PRODUCT,
  productId,
  { productName: 'iPhone 15', price: 999 }
);

// With severity
await createAuditLog(
  shopId,
  userId,
  AUDIT_ACTIONS.BILL_CANCEL,
  AUDIT_ENTITIES.BILL,
  billId,
  { reason: 'Customer requested cancellation', amount: 1500 },
  AUDIT_SEVERITY.WARNING
);

// Bulk operation
await createBulkAuditLog(
  shopId,
  userId,
  AUDIT_ACTIONS.PRODUCT_DELETE,
  AUDIT_ENTITIES.PRODUCT,
  ['prod1', 'prod2', 'prod3'],
  { reason: 'Bulk cleanup of discontinued products' }
);

// With before/after diff
await createAuditLogWithDiff(
  shopId,
  userId,
  AUDIT_ACTIONS.PRODUCT_UPDATE,
  AUDIT_ENTITIES.PRODUCT,
  productId,
  { price: 100, stock: 50 },  // before
  { price: 120, stock: 45 },  // after
  { updatedBy: 'bulk_import' }
);

// In your components
const handleDeleteProduct = async (productId) => {
  try {
    // Get product data before deletion
    const productData = await getProduct(productId);
    
    // Delete product
    await deleteProduct(productId);
    
    // Log the deletion
    await createAuditLog(
      shopId,
      currentUser.uid,
      AUDIT_ACTIONS.PRODUCT_DELETE,
      AUDIT_ENTITIES.PRODUCT,
      productId,
      {
        productName: productData.name,
        productPrice: productData.price,
        reason: 'Manual deletion by staff'
      },
      AUDIT_SEVERITY.WARNING
    );
    
    toast.success('Product deleted successfully');
  } catch (error) {
    toast.error('Failed to delete product');
  }
};
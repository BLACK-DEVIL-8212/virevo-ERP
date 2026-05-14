// Basic usage
try {
  await someAsyncOperation();
} catch (error) {
  const userMessage = handleError(error);
  toast.error(userMessage);
}

// With options
try {
  await someAsyncOperation();
} catch (error) {
  handleError(error, {
    showAlert: true,
    logToServer: true,
    context: { userId: currentUser.id, action: 'checkout' }
  });
}

// Async handler wrapper
const { data, error } = await handleAsyncError(
  fetchUserData(userId),
  { showAlert: false }
);

if (error) {
  console.error('Failed to fetch user:', error.userMessage);
}

// Custom error creation
const error = createCustomError(
  'inventory/insufficient-stock',
  'Not enough stock available',
  ErrorCategory.INVENTORY
);

// Error type checking
if (isNetworkError(error)) {
  showOfflineMessage();
} else if (isAuthError(error)) {
  redirectToLogin();
}
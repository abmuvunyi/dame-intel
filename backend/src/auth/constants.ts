export const jwtConstants = {
  get secret() {
    if (!process.env.JWT_SECRET) {
      console.warn('WARNING: JWT_SECRET environment variable is missing. Falling back to default insecure secret.');
      return 'DEFAULT_INSECURE_DEV_SECRET_DO_NOT_USE_IN_PROD';
    }
    return process.env.JWT_SECRET;
  }
};

// Configuración de AWS Cognito y API
export const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: 'us-east-2_UvmWSCB4i',
      userPoolClientId: '2rio311lk9im8593n2ll0teh5r',
      region: 'us-east-2',
    }
  },
  API: {
    REST: {
      'sunat-api': {
        endpoint: 'https://4tum0sqo0h.execute-api.us-east-2.amazonaws.com/dev',
        region: 'us-east-2',
      }
    }
  }
};

export const API_KEY = 'BUZsB7dnl75nnAcHA06sQ5WaCvPXTRQC5SfJArnC';

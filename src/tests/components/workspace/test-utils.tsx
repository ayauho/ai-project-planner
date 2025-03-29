import React, { createContext, useContext, useState } from 'react';

interface FormState {
  errors: {
    description?: {
      message: string;
    };
  };
  isSubmitting: boolean;
}

interface FormStateContextType {
  formState: FormState;
  updateFormState: (updates: Partial<FormState>) => void;
}

const FormStateContext = createContext<FormStateContextType | null>(null);

export const FormStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [formState, setFormState] = useState<FormState>({
    errors: {},
    isSubmitting: false
  });

  const updateFormState = (updates: Partial<FormState>) => {
    setFormState(prev => ({ ...prev, ...updates }));
  };

  return (
    <FormStateContext.Provider value={{ formState, updateFormState }}>
      {children}
    </FormStateContext.Provider>
  );
};

export const useFormState = () => {
  const context = useContext(FormStateContext);
  if (!context) {
    throw new Error('useFormState must be used within FormStateProvider');
  }
  return context;
};

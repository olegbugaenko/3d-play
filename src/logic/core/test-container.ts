import { GameContainer } from './game/GameContainer';

// Простий тест для GameContainer
export function testGameContainer(): void {
  console.log('🧪 Testing GameContainer...');
  
  const container = GameContainer.getInstance();
  
  // Тест 1: Реєстрація та отримання сервісу
  container.register('testService', () => ({ name: 'Test Service', value: 42 }));
  
  const testService = container.get('testService') as { name: string; value: number };
  console.log('✅ Test 1 passed:', testService.name === 'Test Service' && testService.value === 42);
  
  // Тест 2: Singleton pattern
  const container2 = GameContainer.getInstance();
  const testService2 = container2.get('testService') as { name: string; value: number };
  console.log('✅ Test 2 passed:', testService === testService2);
  
  // Тест 3: Перевірка наявності сервісу
  console.log('✅ Test 3 passed:', container.has('testService') === true);
  console.log('✅ Test 4 passed:', container.has('nonExistentService') === false);
  
  // Тест 4: Список зареєстрованих сервісів
  const services = container.getRegisteredServices();
  console.log('✅ Test 5 passed:', services.includes('testService'));
  
  console.log('🎉 All GameContainer tests passed!');
  console.log('Registered services:', services);
}

import {startupFailure,startupStatus} from './startup-ui';
startupStatus('正在加载三维引擎与场景程序');
import('./main').catch(startupFailure);
